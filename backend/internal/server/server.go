package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"io"
	"log/slog"
	"main/internal/config"
	"main/internal/storage"
	"net"
	"net/http"
	"time"
)

type Server struct {
	DB    *pgxpool.Pool
	Redis *redis.Client
	Store *storage.Store
	Cfg   config.Config
}
type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}
type userKey struct{}

func user(r *http.Request) User { return r.Context().Value(userKey{}).(User) }
func token() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func digest(s string) string { v := sha256.Sum256([]byte(s)); return hex.EncodeToString(v[:]) }
func send(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, message string) {
	send(w, status, map[string]string{"error": message})
}
func internal(w http.ResponseWriter, err error) {
	slog.Error("request failed", "error", err)
	fail(w, 500, "Wystąpił błąd serwera. Spróbuj ponownie.")
}
func readJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(target); err != nil {
		fail(w, 400, "Nieprawidłowe dane żądania.")
		return false
	}
	var extra any
	if err := d.Decode(&extra); !errors.Is(err, io.EOF) {
		fail(w, 400, "Oczekiwano jednego obiektu JSON.")
		return false
	}
	return true
}
func (s *Server) Router() http.Handler {
	limitTransfers := uploadLimit(s.Cfg.MaxConcurrentUploads)
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Recoverer, s.security, s.logging)
	r.Get("/health", s.health)
	r.Route("/api", func(r chi.Router) {
		r.Get("/config", func(w http.ResponseWriter, r *http.Request) {
			send(w, 200, map[string]any{"registration_enabled": s.Cfg.RegistrationEnabled, "max_upload_bytes": s.Cfg.MaxUploadBytes})
		})
		r.With(s.rateLimit("auth", 30, 15*time.Minute)).Post("/auth/register", s.register)
		r.With(s.rateLimit("auth", 30, 15*time.Minute)).Post("/auth/login", s.login)
		r.With(s.rateLimit("refresh", 120, time.Minute)).Post("/auth/refresh", s.refresh)
		r.Post("/auth/logout", s.logout)
		r.Get("/shared/{token}", s.sharedLibrary)
		r.Get("/shared/{token}/games/{id}/download", s.sharedDownload)
		r.Get("/shared/{token}/games/{id}/checksum", s.sharedChecksum)
		r.Get("/shared/{token}/games/{id}/cover", s.sharedCover)
		r.Group(func(r chi.Router) {
			r.Use(s.authenticate)
			r.Get("/auth/me", func(w http.ResponseWriter, r *http.Request) { send(w, 200, user(r)) })
			r.Get("/extensions", s.extensions)
			r.Get("/games", s.listGames)
			r.With(limitTransfers).Post("/games", s.upload)
			r.Patch("/games/{id}", s.updateGame)
			r.Delete("/games/{id}", s.deleteGame)
			r.Get("/games/{id}/download", s.download)
			r.Get("/games/{id}/checksum", s.checksum)
			r.Get("/games/{id}/cover", s.cover)
			r.With(limitTransfers).Put("/games/{id}/cover", s.uploadCover)
			r.Get("/shares", s.listShares)
			r.Post("/shares", s.createShare)
			r.Delete("/shares/{id}", s.revokeShare)
			r.With(s.admin).Put("/admin/extensions", s.saveExtension)
		})
	})
	return r
}
func (s *Server) security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			origin := r.Header.Get("Origin")
			if (origin != "" && origin != s.Cfg.AppOrigin) || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				fail(w, 403, "Niedozwolone źródło żądania.")
				return
			}
			if r.Header.Get("Sec-Fetch-Site") != "" && origin == "" {
				fail(w, 403, "Brak nagłówka Origin.")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
func (s *Server) logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		slog.Info("http", "method", r.Method, "route", chi.RouteContext(r.Context()).RoutePattern(), "status", ww.Status(), "duration", time.Since(start).String(), "request_id", middleware.GetReqID(r.Context()))
	})
}
func (s *Server) rateLimit(scope string, limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip, _, _ := net.SplitHostPort(r.RemoteAddr)
			if s.Cfg.TrustProxy && r.Header.Get("X-Real-IP") != "" {
				ip = r.Header.Get("X-Real-IP")
			}
			key := "rate:" + scope + ":" + digest(ip)
			n, err := s.Redis.Eval(r.Context(), `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n`, []string{key}, int(window.Seconds())).Int()
			if err != nil {
				fail(w, 503, "Logowanie jest chwilowo niedostępne.")
				return
			}
			if n > limit {
				w.Header().Set("Retry-After", fmt.Sprint(int(window.Seconds())))
				fail(w, 429, "Zbyt wiele prób. Spróbuj później.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
func (s *Server) admin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if user(r).Role != "admin" {
			fail(w, 403, "Wymagane uprawnienia administratora.")
			return
		}
		next.ServeHTTP(w, r)
	})
}
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if s.DB.Ping(ctx) != nil || s.Redis.Ping(ctx).Err() != nil || s.Store.Ping(ctx) != nil {
		fail(w, 503, "Dependency unavailable")
		return
	}
	send(w, 200, map[string]string{"status": "ok"})
}
