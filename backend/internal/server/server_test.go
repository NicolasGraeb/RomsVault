package server

import (
	"main/internal/config"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCrossOriginWrites(t *testing.T) {
	s := Server{Cfg: config.Config{AppOrigin: "https://vault.example"}}
	for _, tc := range []struct {
		name, method, origin, site string
		want                       int
	}{
		{"same-origin", "POST", "https://vault.example", "same-origin", 204},
		{"foreign-origin", "POST", "https://evil.example", "cross-site", 403},
		{"null-origin", "POST", "null", "cross-site", 403},
		{"browser-without-origin", "POST", "", "same-origin", 403},
		{"cli", "POST", "", "", 204},
		{"read", "GET", "", "", 204},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, "/api/games", nil)
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("Sec-Fetch-Site", tc.site)
			w := httptest.NewRecorder()
			s.security(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })).ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("got %d, want %d", w.Code, tc.want)
			}
		})
	}
}
func TestStrictJSON(t *testing.T) {
	for _, tc := range []struct {
		input string
		ok    bool
	}{{`{"name":"A"}`, true}, {`{"unknown":1}`, false}, {`{"name":"A"} {"name":"B"}`, false}, {`{"name":"A"} garbage`, false}, {strings.Repeat("x", 70<<10), false}} {
		r := httptest.NewRequest("POST", "/", strings.NewReader(tc.input))
		w := httptest.NewRecorder()
		var in struct {
			Name string `json:"name"`
		}
		if got := readJSON(w, r, &in); got != tc.ok {
			t.Fatalf("readJSON returned %v, want %v", got, tc.ok)
		}
	}
}
func TestFilenameSanitization(t *testing.T) {
	for input, want := range map[string]string{"../../game.iso": "game.iso", "C:\\folder\\game.iso": "game.iso", "game\r\n.iso": "game.iso", "Zażółć.iso": "Zażółć.iso"} {
		if got := safeName(input); got != want {
			t.Fatalf("safeName(%q)=%q, want %q", input, got, want)
		}
	}
}
func TestSessionCookieFlags(t *testing.T) {
	s := Server{Cfg: config.Config{CookieSecure: true}}
	w := httptest.NewRecorder()
	s.cookie(w, "rv_refresh", "test", refreshTTL)
	c := w.Result().Cookies()[0]
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode || c.Path != "/api/auth" {
		t.Fatalf("unsafe cookie: %+v", c)
	}
}
