package server

import (
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"net/http"
	"strings"
	"time"
)

type Share struct {
	ID        string    `json:"id"`
	Label     string    `json:"label"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *Server) createShare(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Label string `json:"label"`
		Days  int    `json:"days"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.Label = strings.TrimSpace(in.Label)
	if len(in.Label) < 1 || len(in.Label) > 80 || in.Days < 1 || in.Days > 365 {
		fail(w, 400, "Podaj nazwę i ważność linku od 1 do 365 dni.")
		return
	}
	secret := token()
	share := Share{uuid.NewString(), in.Label, time.Now().Add(time.Duration(in.Days) * 24 * time.Hour), time.Now()}
	_, err := s.DB.Exec(r.Context(), `INSERT INTO shares(id,owner_id,token_hash,label,expires_at) VALUES($1,$2,$3,$4,$5)`, share.ID, user(r).ID, digest(secret), share.Label, share.ExpiresAt)
	if err != nil {
		internal(w, err)
		return
	}
	send(w, 201, map[string]any{"share": share, "url": s.Cfg.AppOrigin + "/#/share/" + secret})
}
func (s *Server) listShares(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(r.Context(), `SELECT id,label,expires_at,created_at FROM shares WHERE owner_id=$1 ORDER BY created_at DESC`, user(r).ID)
	if err != nil {
		internal(w, err)
		return
	}
	defer rows.Close()
	out := make([]Share, 0)
	for rows.Next() {
		var sh Share
		if err = rows.Scan(&sh.ID, &sh.Label, &sh.ExpiresAt, &sh.CreatedAt); err != nil {
			internal(w, err)
			return
		}
		out = append(out, sh)
	}
	if err = rows.Err(); err != nil {
		internal(w, err)
		return
	}
	send(w, 200, out)
}
func (s *Server) revokeShare(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		fail(w, 404, "Nie znaleziono linku.")
		return
	}
	result, err := s.DB.Exec(r.Context(), `DELETE FROM shares WHERE id=$1 AND owner_id=$2`, id, user(r).ID)
	if err != nil {
		internal(w, err)
		return
	}
	if result.RowsAffected() == 0 {
		fail(w, 404, "Nie znaleziono linku.")
		return
	}
	w.WriteHeader(204)
}
func (s *Server) sharedOwner(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	var id, name string
	secret := chi.URLParam(r, "token")
	if len(secret) != 43 {
		fail(w, 404, "Link wygasł lub został wyłączony.")
		return "", "", false
	}
	err := s.DB.QueryRow(r.Context(), `SELECT u.id,u.name FROM shares sh JOIN users u ON u.id=sh.owner_id WHERE sh.token_hash=$1 AND sh.expires_at>now()`, digest(secret)).Scan(&id, &name)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Link wygasł lub został wyłączony.")
		return "", "", false
	}
	if err != nil {
		internal(w, err)
		return "", "", false
	}
	return id, name, true
}
func (s *Server) sharedLibrary(w http.ResponseWriter, r *http.Request) {
	owner, name, ok := s.sharedOwner(w, r)
	if !ok {
		return
	}
	games, err := s.games(r.Context(), owner)
	if err != nil {
		internal(w, err)
		return
	}
	send(w, 200, map[string]any{"owner": name, "games": games})
}
func (s *Server) sharedDownload(w http.ResponseWriter, r *http.Request) {
	owner, _, ok := s.sharedOwner(w, r)
	if ok {
		s.serveDownload(w, r, owner)
	}
}
func (s *Server) sharedChecksum(w http.ResponseWriter, r *http.Request) {
	owner, _, ok := s.sharedOwner(w, r)
	if ok {
		s.serveChecksum(w, r, owner)
	}
}
func (s *Server) sharedCover(w http.ResponseWriter, r *http.Request) {
	owner, _, ok := s.sharedOwner(w, r)
	if ok {
		s.serveCover(w, r, owner)
	}
}
