package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestUploadLimitReleasesSlot(t *testing.T) {
	entered, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	limit := uploadLimit(1)
	busy := limit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-release
		w.WriteHeader(204)
	}))
	go func() {
		defer close(done)
		busy.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/", nil))
	}()
	<-entered
	called := false
	other := limit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(204) }))
	w := httptest.NewRecorder()
	other.ServeHTTP(w, httptest.NewRequest("PUT", "/cover", nil))
	if w.Code != 503 || w.Header().Get("Retry-After") != "5" || called {
		t.Errorf("busy upload should be rejected before handler: %d, called=%v", w.Code, called)
	}
	close(release)
	<-done
	w = httptest.NewRecorder()
	other.ServeHTTP(w, httptest.NewRequest("PUT", "/cover", nil))
	if w.Code != 204 || !called {
		t.Fatal("upload slot was not released")
	}
}
