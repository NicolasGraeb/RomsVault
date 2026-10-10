package server

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"net/mail"
	"strings"
	"time"
)

const accessTTL = 15 * time.Minute
const refreshTTL = 30 * 24 * time.Hour

// Used when an email does not exist, to avoid skipping the expensive password check.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("not-a-real-user-password"), bcrypt.DefaultCost)

func validEmail(value string) bool {
	a, err := mail.ParseAddress(value)
	return err == nil && a.Address == value && len(value) <= 254
}
func uniqueViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}
func (s *Server) BootstrapAdmin(ctx context.Context) error {
	if s.Cfg.AdminEmail == "" {
		return nil
	}
	if !validEmail(s.Cfg.AdminEmail) {
		return errors.New("ADMIN_EMAIL is invalid")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(s.Cfg.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	// Never silently change an existing user's role or password on restart.
	_, err = s.DB.Exec(ctx, `INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,'Administrator',$3,'admin') ON CONFLICT(email) DO NOTHING`, uuid.NewString(), s.Cfg.AdminEmail, string(hash))
	if err != nil {
		return err
	}
	var role string
	if err = s.DB.QueryRow(ctx, `SELECT role FROM users WHERE email=$1`, s.Cfg.AdminEmail).Scan(&role); err != nil {
		return err
	}
	if role != "admin" {
		return errors.New("ADMIN_EMAIL belongs to an existing non-admin account; choose a new bootstrap email")
	}
	return nil
}
func (s *Server) cookie(w http.ResponseWriter, name, value string, ttl time.Duration) {
	path := "/api"
	if name == "rv_refresh" {
		path = "/api/auth"
	}
	maxAge := int(ttl.Seconds())
	if ttl < 0 {
		maxAge = -1
	}
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: path, MaxAge: maxAge, Expires: time.Now().Add(ttl), HttpOnly: true, Secure: s.Cfg.CookieSecure, SameSite: http.SameSiteLaxMode})
}
func (s *Server) issueSession(w http.ResponseWriter, r *http.Request, u User) {
	access, refresh := token(), token()
	_, err := s.DB.Exec(r.Context(), `INSERT INTO sessions(id,user_id,access_hash,refresh_hash,access_expires_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)`, uuid.NewString(), u.ID, digest(access), digest(refresh), time.Now().Add(accessTTL), time.Now().Add(refreshTTL))
	if err != nil {
		internal(w, err)
		return
	}
	s.cookie(w, "rv_access", access, accessTTL)
	s.cookie(w, "rv_refresh", refresh, refreshTTL)
	send(w, 200, u)
}
func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.RegistrationEnabled {
		fail(w, 403, "Tworzenie kont jest wyłączone.")
		return
	}
	var in struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	if !validEmail(in.Email) || len(in.Name) < 2 || len(in.Name) > 80 || len(in.Password) < 12 || len(in.Password) > 72 {
		fail(w, 400, "Podaj poprawny e-mail, nazwę (2–80 znaków) i hasło (12–72 bajty).")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		internal(w, err)
		return
	}
	u := User{uuid.NewString(), in.Email, in.Name, "user"}
	_, err = s.DB.Exec(r.Context(), `INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)`, u.ID, u.Email, u.Name, string(hash))
	if uniqueViolation(err) {
		fail(w, 409, "Nie można utworzyć konta z tym adresem e-mail.")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	s.issueSession(w, r, u)
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	var u User
	var hash string
	err := s.DB.QueryRow(r.Context(), `SELECT id,email,name,role,password_hash FROM users WHERE email=$1`, strings.ToLower(strings.TrimSpace(in.Email))).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &hash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		internal(w, err)
		return
	}
	if hash == "" {
		hash = string(dummyHash)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil || err != nil {
		fail(w, 401, "Nieprawidłowy e-mail lub hasło.")
		return
	}
	s.issueSession(w, r, u)
}
func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("rv_access")
		if err != nil {
			fail(w, 401, "Zaloguj się, aby kontynuować.")
			return
		}
		var u User
		err = s.DB.QueryRow(r.Context(), `SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.expires_at>now() AND ((s.access_hash=$1 AND s.access_expires_at>now()) OR (s.previous_access_hash=$1 AND s.previous_valid_until>now()))`, digest(c.Value)).Scan(&u.ID, &u.Email, &u.Name, &u.Role)
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, 401, "Sesja wymaga odświeżenia.")
			return
		}
		if err != nil {
			internal(w, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey{}, u)))
	})
}
func (s *Server) refresh(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie("rv_refresh")
	if err != nil {
		fail(w, 401, "Zaloguj się ponownie.")
		return
	}
	tx, err := s.DB.Begin(r.Context())
	if err != nil {
		internal(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var id, current string
	var created time.Time
	err = tx.QueryRow(r.Context(), `SELECT id,refresh_hash,created_at FROM sessions WHERE expires_at>now() AND (refresh_hash=$1 OR (previous_refresh_hash=$1 AND previous_valid_until>now())) FOR UPDATE`, digest(c.Value)).Scan(&id, &current, &created)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 401, "Sesja wygasła. Zaloguj się ponownie.")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	// A concurrent tab may have used the previous token. It must not overwrite newer cookies.
	if current != digest(c.Value) {
		w.WriteHeader(204)
		return
	}
	access, refresh := token(), token()
	expiry := time.Now().Add(refreshTTL)
	if cap := created.Add(90 * 24 * time.Hour); expiry.After(cap) {
		expiry = cap
	}
	if !expiry.After(time.Now()) {
		fail(w, 401, "Zaloguj się ponownie.")
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE sessions SET previous_access_hash=access_hash,previous_refresh_hash=refresh_hash,previous_valid_until=now()+interval '60 seconds',access_hash=$2,refresh_hash=$3,access_expires_at=$4,expires_at=$5 WHERE id=$1`, id, digest(access), digest(refresh), time.Now().Add(accessTTL), expiry)
	if err != nil {
		internal(w, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		internal(w, err)
		return
	}
	s.cookie(w, "rv_access", access, accessTTL)
	s.cookie(w, "rv_refresh", refresh, time.Until(expiry))
	w.WriteHeader(204)
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie("rv_refresh"); err == nil {
		if _, err = s.DB.Exec(r.Context(), `DELETE FROM sessions WHERE refresh_hash=$1 OR previous_refresh_hash=$1`, digest(c.Value)); err != nil {
			internal(w, err)
			return
		}
	}
	s.cookie(w, "rv_access", "", -time.Hour)
	s.cookie(w, "rv_refresh", "", -time.Hour)
	w.WriteHeader(204)
}
