package server

import "net/http"

// ROM multipart buffers and decoded cover images share one per-process budget.
// Reject excess requests before reading their bodies rather than queueing files in RAM.
func uploadLimit(concurrency int) func(http.Handler) http.Handler {
	if concurrency < 1 {
		concurrency = 2
	}
	slots := make(chan struct{}, concurrency)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
				next.ServeHTTP(w, r)
			default:
				w.Header().Set("Retry-After", "5")
				fail(w, http.StatusServiceUnavailable, "Serwer obsługuje teraz inny upload. Ponów przesyłanie za chwilę.")
			}
		})
	}
}
