package main

import (
	"context"
	"errors"
	"fmt"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"log/slog"
	"main/internal/config"
	"main/internal/database"
	"main/internal/server"
	"main/internal/storage"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		slog.Error("application stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	startup, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	db, err := database.NewPostgres(startup, cfg.Database.URL, cfg.Database.MaxConns)
	if err != nil {
		return err
	}
	defer db.Close()
	if err = database.Migrate(startup, db); err != nil {
		return err
	}
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return err
	}
	opts.DialTimeout = 3 * time.Second
	opts.ReadTimeout = 2 * time.Second
	opts.WriteTimeout = 2 * time.Second
	cache := redis.NewClient(opts)
	defer cache.Close()
	if err = cache.Ping(startup).Err(); err != nil {
		return err
	}
	store, err := storage.New(startup, cfg.S3)
	if err != nil {
		return err
	}
	app := &server.Server{DB: db, Redis: cache, Store: store, Cfg: cfg}
	if err = app.BootstrapAdmin(startup); err != nil {
		return err
	}
	go app.Maintenance(ctx)
	srv := &http.Server{Addr: fmt.Sprintf("%s:%d", cfg.HTTP.Host, cfg.HTTP.Port), Handler: app.Router(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second, MaxHeaderBytes: 16 << 10}
	failed := make(chan error, 1)
	go func() { slog.Info("RomVault listening", "address", srv.Addr); failed <- srv.ListenAndServe() }()
	select {
	case err = <-failed:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
	}
	shutdown, done := context.WithTimeout(context.Background(), 30*time.Second)
	defer done()
	return srv.Shutdown(shutdown)
}
