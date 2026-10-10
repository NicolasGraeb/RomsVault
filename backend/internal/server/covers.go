package server

import (
	"bytes"
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"time"
)

func (s *Server) cover(w http.ResponseWriter, r *http.Request) { s.serveCover(w, r, user(r).ID) }
func (s *Server) serveCover(w http.ResponseWriter, r *http.Request, owner string) {
	g, ok := s.requestedGame(w, r, owner)
	if !ok {
		return
	}
	if !g.HasCover {
		fail(w, 404, "Brak okładki.")
		return
	}
	obj, err := s.Store.Open(r.Context(), g.CoverVersion)
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
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("ETag", `"`+info.ETag+`"`)
	http.ServeContent(w, r, "cover.jpg", info.LastModified, obj)
}
func (s *Server) uploadCover(w http.ResponseWriter, r *http.Request) {
	g, ok := s.requestedGame(w, r, user(r).ID)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	b, err := io.ReadAll(r.Body)
	if err != nil {
		fail(w, 413, "Okładka może mieć maksymalnie 10 MB.")
		return
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil || (format != "jpeg" && format != "png") || cfg.Width < 1 || cfg.Height < 1 || int64(cfg.Width)*int64(cfg.Height) > 24_000_000 {
		fail(w, 415, "Wybierz obraz JPG lub PNG, do 24 megapikseli.")
		return
	}
	img, _, err := image.Decode(bytes.NewReader(b))
	if err != nil {
		fail(w, 415, "Uszkodzony obraz.")
		return
	}
	// Re-encoding strips metadata and prevents serving arbitrary uploaded content.
	var encoded bytes.Buffer
	if err = jpeg.Encode(&encoded, img, &jpeg.Options{Quality: 88}); err != nil {
		internal(w, err)
		return
	}
	key := "covers/" + user(r).ID + "/" + uuid.NewString() + ".jpg"
	committed := false
	defer func() {
		if !committed {
			s.cleanupObject(key)
		}
	}()
	if err = s.Store.Put(r.Context(), key, bytes.NewReader(encoded.Bytes()), int64(encoded.Len()), "image/jpeg"); err != nil {
		internal(w, err)
		return
	}
	tx, err := s.DB.Begin(r.Context())
	if err != nil {
		internal(w, err)
		return
	}
	defer tx.Rollback(context.Background())
	var old string
	err = tx.QueryRow(r.Context(), `SELECT cover_key FROM games WHERE id=$1 AND owner_id=$2 FOR UPDATE`, g.ID, user(r).ID).Scan(&old)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Gra została usunięta.")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE games SET cover_key=$2 WHERE id=$1`, g.ID, key); err != nil {
		internal(w, err)
		return
	}
	if old != "" {
		if _, err = tx.Exec(r.Context(), `INSERT INTO storage_garbage(storage_key) VALUES($1) ON CONFLICT DO NOTHING`, old); err != nil {
			internal(w, err)
			return
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
	committed = true
	g, err = s.game(r.Context(), user(r).ID, g.ID)
	if err != nil {
		internal(w, err)
		return
	}
	send(w, 200, g)
}

// Deletes are retried durably after storage outages and application restarts.
func (s *Server) Maintenance(ctx context.Context) {
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			run, cancel := context.WithTimeout(ctx, 50*time.Second)
			_, _ = s.DB.Exec(run, `DELETE FROM sessions WHERE expires_at<now()`)
			rows, err := s.DB.Query(run, `SELECT storage_key FROM storage_garbage ORDER BY created_at LIMIT 100`)
			if err == nil {
				var keys []string
				for rows.Next() {
					var k string
					if rows.Scan(&k) == nil {
						keys = append(keys, k)
					}
				}
				rows.Close()
				for _, k := range keys {
					if s.Store.Delete(run, k) == nil {
						_, _ = s.DB.Exec(run, `DELETE FROM storage_garbage WHERE storage_key=$1`, k)
					}
				}
			}
			cancel()
		}
	}
}
