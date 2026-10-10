package server

import (
	"net/http"
	"regexp"
	"strings"
)

type Extension struct {
	Extension string `json:"extension"`
	Platform  string `json:"platform"`
	Enabled   bool   `json:"enabled"`
}

var extensionPattern = regexp.MustCompile(`^\.[a-z0-9]{1,12}$`)

func (s *Server) extensions(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(r.Context(), `SELECT extension,platform,enabled FROM extensions ORDER BY platform,extension`)
	if err != nil {
		internal(w, err)
		return
	}
	defer rows.Close()
	out := make([]Extension, 0)
	for rows.Next() {
		var e Extension
		if err = rows.Scan(&e.Extension, &e.Platform, &e.Enabled); err != nil {
			internal(w, err)
			return
		}
		out = append(out, e)
	}
	if err = rows.Err(); err != nil {
		internal(w, err)
		return
	}
	send(w, 200, out)
}
func (s *Server) saveExtension(w http.ResponseWriter, r *http.Request) {
	var in Extension
	if !readJSON(w, r, &in) {
		return
	}
	in.Extension = strings.ToLower(strings.TrimSpace(in.Extension))
	in.Platform = strings.TrimSpace(in.Platform)
	if !extensionPattern.MatchString(in.Extension) || len(in.Platform) < 1 || len(in.Platform) > 80 {
		fail(w, 400, "Podaj rozszerzenie (np. .iso) i platformę.")
		return
	}
	_, err := s.DB.Exec(r.Context(), `INSERT INTO extensions(extension,platform,enabled) VALUES($1,$2,$3) ON CONFLICT(extension) DO UPDATE SET platform=EXCLUDED.platform,enabled=EXCLUDED.enabled`, in.Extension, in.Platform, in.Enabled)
	if err != nil {
		internal(w, err)
		return
	}
	send(w, 200, in)
}
