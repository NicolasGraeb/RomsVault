package server

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"
	"unicode"
)

type Game struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Platform     string    `json:"platform"`
	OriginalName string    `json:"original_name"`
	Extension    string    `json:"extension"`
	Size         int64     `json:"size"`
	Checksum     string    `json:"checksum"`
	HasCover     bool      `json:"has_cover"`
	Favorite     bool      `json:"favorite"`
	CreatedAt    time.Time `json:"created_at"`
	CoverVersion string    `json:"cover_version"`
	StorageKey   string    `json:"-"`
}

const gameColumns = `id,title,platform,original_name,extension,size,checksum,(cover_key<>''),favorite,created_at,cover_key,storage_key`

func scanGame(row pgx.Row) (Game, error) {
	var g Game
	err := row.Scan(&g.ID, &g.Title, &g.Platform, &g.OriginalName, &g.Extension, &g.Size, &g.Checksum, &g.HasCover, &g.Favorite, &g.CreatedAt, &g.CoverVersion, &g.StorageKey)
	return g, err
}
func (s *Server) games(ctx context.Context, owner string) ([]Game, error) {
	var version int64
	if err := s.DB.QueryRow(ctx, `SELECT library_version FROM users WHERE id=$1`, owner).Scan(&version); err != nil {
		return nil, err
	}
	key := fmt.Sprintf("library:%s:%d", owner, version)
	if b, err := s.Redis.Get(ctx, key).Bytes(); err == nil {
		var games []Game
		if json.Unmarshal(b, &games) == nil {
			return games, nil
		}
	}
	rows, err := s.DB.Query(ctx, `SELECT `+gameColumns+` FROM games WHERE owner_id=$1 ORDER BY created_at DESC`, owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	games := make([]Game, 0)
	for rows.Next() {
		g, err := scanGame(rows)
		if err != nil {
			return nil, err
		}
		games = append(games, g)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	b, _ := json.Marshal(games)
	_ = s.Redis.Set(ctx, key, b, 2*time.Minute).Err()
	return games, nil
}
func (s *Server) listGames(w http.ResponseWriter, r *http.Request) {
	games, err := s.games(r.Context(), user(r).ID)
	if err != nil {
		internal(w, err)
		return
	}
	send(w, 200, games)
}
func safeName(name string) string {
	name = strings.ReplaceAll(name, "\\", "/")
	name = path.Base(name)
	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name)
}

var checksumPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func (s *Server) upload(w http.ResponseWriter, r *http.Request) {
	owner := user(r).ID
	key := r.Header.Get("Idempotency-Key")
	if _, err := uuid.Parse(key); err != nil {
		fail(w, 400, "Wymagany Idempotency-Key w formacie UUID.")
		return
	}
	name, err := url.PathUnescape(r.Header.Get("X-Filename"))
	if err != nil {
		fail(w, 400, "Nieprawidłowa nazwa pliku.")
		return
	}
	name = safeName(name)
	ext := strings.ToLower(path.Ext(name))
	title, err := url.PathUnescape(r.Header.Get("X-Title"))
	if err != nil {
		fail(w, 400, "Nieprawidłowy tytuł.")
		return
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = strings.TrimSuffix(name, path.Ext(name))
	}
	platform, err := url.PathUnescape(r.Header.Get("X-Platform"))
	if err != nil {
		fail(w, 400, "Nieprawidłowa platforma.")
		return
	}
	expected := strings.ToLower(r.Header.Get("X-Checksum-SHA256"))
	if name == "." || len(name) > 255 || len(title) < 1 || len(title) > 200 || len(platform) > 80 || !checksumPattern.MatchString(expected) {
		fail(w, 400, "Nieprawidłowe metadane lub suma SHA-256.")
		return
	}
	if r.ContentLength <= 0 {
		fail(w, 411, "Wymagany niepusty plik i Content-Length.")
		return
	}
	if r.ContentLength > s.Cfg.MaxUploadBytes {
		fail(w, 413, "Plik przekracza limit serwera.")
		return
	}
	var defaultPlatform string
	err = s.DB.QueryRow(r.Context(), `SELECT platform FROM extensions WHERE extension=$1 AND enabled`, ext).Scan(&defaultPlatform)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 415, "To rozszerzenie nie jest obsługiwane. Skontaktuj się z administratorem.")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	if strings.TrimSpace(platform) == "" {
		platform = defaultPlatform
	}
	metadata, _ := json.Marshal([]any{name, title, platform, expected, r.ContentLength})
	fingerprint := digest(string(metadata))
	lockKey := "upload:" + owner + ":" + key
	lockValue := token()
	locked, err := s.Redis.SetNX(r.Context(), lockKey, lockValue, 2*time.Hour).Result()
	if err != nil {
		fail(w, 503, "Upload jest chwilowo niedostępny.")
		return
	}
	if !locked {
		fail(w, 409, "Ten upload już trwa. Spróbuj ponownie za chwilę.")
		return
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.Redis.Eval(ctx, `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0`, []string{lockKey}, lockValue)
	}()
	var oldFingerprint string
	var oldID string
	err = s.DB.QueryRow(r.Context(), `SELECT id,request_fingerprint FROM games WHERE owner_id=$1 AND idempotency_key=$2`, owner, key).Scan(&oldID, &oldFingerprint)
	if err == nil {
		if oldFingerprint != fingerprint {
			fail(w, 409, "Ten klucz został już użyty dla innego uploadu.")
			return
		}
		g, err := s.game(r.Context(), owner, oldID)
		if err != nil {
			internal(w, err)
			return
		}
		w.Header().Set("Idempotency-Replayed", "true")
		slog.Info("upload replayed", "user_id", owner, "game_id", oldID)
		send(w, 200, g)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		internal(w, err)
		return
	}
	var duplicate bool
	if err = s.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM games WHERE owner_id=$1 AND checksum=$2)`, owner, expected).Scan(&duplicate); err != nil {
		internal(w, err)
		return
	}
	if duplicate {
		fail(w, 409, "Ten plik znajduje się już w Twojej bibliotece.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 110*time.Minute)
	defer cancel()
	id := uuid.NewString()
	storageKey := "roms/" + owner + "/" + id + ext
	committed := false
	defer func() {
		if !committed {
			s.cleanupObject(storageKey)
		}
	}()
	hash := sha256.New()
	r.Body = http.MaxBytesReader(w, r.Body, s.Cfg.MaxUploadBytes)
	if err = s.Store.Put(ctx, storageKey, io.TeeReader(r.Body, hash), r.ContentLength, "application/octet-stream"); err != nil {
		internal(w, err)
		return
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if actual != expected {
		slog.Warn("upload checksum mismatch", "user_id", owner)
		fail(w, 422, "Suma SHA-256 nie zgadza się. Plik nie został zapisany w bibliotece.")
		return
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		internal(w, err)
		return
	}
	defer tx.Rollback(context.Background())
	_, err = tx.Exec(ctx, `INSERT INTO games(id,owner_id,title,platform,original_name,extension,storage_key,size,checksum,idempotency_key,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, id, owner, title, platform, name, ext, storageKey, r.ContentLength, actual, key, fingerprint)
	if uniqueViolation(err) {
		fail(w, 409, "Ten plik został już dodany.")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	if _, err = tx.Exec(ctx, `UPDATE users SET library_version=library_version+1 WHERE id=$1`, owner); err != nil {
		internal(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		internal(w, err)
		return
	}
	committed = true
	slog.Info("upload completed", "user_id", owner, "game_id", id, "bytes", r.ContentLength)
	g, err := s.game(ctx, owner, id)
	if err != nil {
		internal(w, err)
		return
	}
	send(w, 201, g)
}
func (s *Server) game(ctx context.Context, owner, id string) (Game, error) {
	if _, err := uuid.Parse(id); err != nil {
		return Game{}, pgx.ErrNoRows
	}
	return scanGame(s.DB.QueryRow(ctx, `SELECT `+gameColumns+` FROM games WHERE id=$1 AND owner_id=$2`, id, owner))
}
func (s *Server) requestedGame(w http.ResponseWriter, r *http.Request, owner string) (Game, bool) {
	g, err := s.game(r.Context(), owner, chi.URLParam(r, "id"))
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Nie znaleziono gry.")
		return g, false
	}
	if err != nil {
		internal(w, err)
		return g, false
	}
	return g, true
}
func (s *Server) updateGame(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Title    *string `json:"title"`
		Platform *string `json:"platform"`
		Favorite *bool   `json:"favorite"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.Title != nil {
		v := strings.TrimSpace(*in.Title)
		in.Title = &v
		if len(v) < 1 || len(v) > 200 {
			fail(w, 400, "Nieprawidłowy tytuł.")
			return
		}
	}
	if in.Platform != nil {
		v := strings.TrimSpace(*in.Platform)
		in.Platform = &v
		if len(v) < 1 || len(v) > 80 {
			fail(w, 400, "Nieprawidłowa platforma.")
			return
		}
	}
	g, ok := s.requestedGame(w, r, user(r).ID)
	if !ok {
		return
	}
	tx, err := s.DB.Begin(r.Context())
	if err != nil {
		internal(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	result, err := tx.Exec(r.Context(), `UPDATE games SET title=COALESCE($3,title),platform=COALESCE($4,platform),favorite=COALESCE($5,favorite) WHERE id=$1 AND owner_id=$2`, g.ID, user(r).ID, in.Title, in.Platform, in.Favorite)
	if err != nil {
		internal(w, err)
		return
	}
	if result.RowsAffected() == 0 {
		fail(w, 404, "Nie znaleziono gry.")
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE users SET library_version=library_version+1 WHERE id=$1`, user(r).ID); err != nil {
		internal(w, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		internal(w, err)
		return
	}
	g, err = s.game(r.Context(), user(r).ID, g.ID)
	if err != nil {
		internal(w, err)
		return
	}
	send(w, 200, g)
}
func (s *Server) deleteGame(w http.ResponseWriter, r *http.Request) {
	if _, err := uuid.Parse(chi.URLParam(r, "id")); err != nil {
		fail(w, 404, "Nie znaleziono gry.")
		return
	}
	tx, err := s.DB.Begin(r.Context())
	if err != nil {
		internal(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var key, cover string
	err = tx.QueryRow(r.Context(), `DELETE FROM games WHERE id=$1 AND owner_id=$2 RETURNING storage_key,cover_key`, chi.URLParam(r, "id"), user(r).ID).Scan(&key, &cover)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Nie znaleziono gry.")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	for _, k := range []string{key, cover} {
		if k != "" {
			if _, err = tx.Exec(r.Context(), `INSERT INTO storage_garbage(storage_key) VALUES($1) ON CONFLICT DO NOTHING`, k); err != nil {
				internal(w, err)
				return
			}
		}
	}
	if _, err = tx.Exec(r.Context(), `UPDATE users SET library_version=library_version+1 WHERE id=$1`, user(r).ID); err != nil {
		internal(w, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		internal(w, err)
		return
	}
	w.WriteHeader(204)
}
func (s *Server) download(w http.ResponseWriter, r *http.Request) { s.serveDownload(w, r, user(r).ID) }
func (s *Server) serveDownload(w http.ResponseWriter, r *http.Request, owner string) {
	g, ok := s.requestedGame(w, r, owner)
	if !ok {
		return
	}
	obj, err := s.Store.Open(r.Context(), g.StorageKey)
	if err != nil {
		internal(w, err)
		return
	}
	defer obj.Close()
	info, err := obj.Stat()
	if err != nil {
		internal(w, err)
		return
	}
	if info.Size != g.Size {
		fail(w, 502, "Rozmiar pliku w magazynie jest nieprawidłowy.")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": g.OriginalName}))
	w.Header().Set("X-Checksum-SHA256", g.Checksum)
	raw, _ := hex.DecodeString(g.Checksum)
	w.Header().Set("Repr-Digest", "sha-256=:"+base64.StdEncoding.EncodeToString(raw)+":")
	w.Header().Set("ETag", `"`+g.Checksum+`"`)
	http.ServeContent(w, r, g.OriginalName, g.CreatedAt, obj)
}
func (s *Server) checksum(w http.ResponseWriter, r *http.Request) { s.serveChecksum(w, r, user(r).ID) }
func (s *Server) serveChecksum(w http.ResponseWriter, r *http.Request, owner string) {
	g, ok := s.requestedGame(w, r, owner)
	if !ok {
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": g.OriginalName + ".sha256"}))
	fmt.Fprintf(w, "%s  %s\n", g.Checksum, g.OriginalName)
}
func (s *Server) cleanupObject(key string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	// A commit can succeed even if its acknowledgement is lost. Never delete a
	// referenced object on an ambiguous commit or while PostgreSQL is unavailable.
	var referenced bool
	if err := s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM games WHERE storage_key=$1 OR cover_key=$1)`, key).Scan(&referenced); err != nil {
		slog.Error("object cleanup deferred: cannot establish commit outcome", "error", err)
		return
	}
	if referenced {
		return
	}
	if err := s.Store.Delete(ctx, key); err != nil {
		_, _ = s.DB.Exec(ctx, `INSERT INTO storage_garbage(storage_key) VALUES($1) ON CONFLICT DO NOTHING`, key)
	}
}
