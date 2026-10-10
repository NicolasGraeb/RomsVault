package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewPostgres(
	ctx context.Context,
	databaseURL string,
	maxConns int32,
) (*pgxpool.Pool, error) {

	options, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse postgres configuration: %w", err)
	}
	options.MaxConns = maxConns
	options.MinConns = 0
	pool, err := pgxpool.NewWithConfig(ctx, options)
	if err != nil {
		return nil, fmt.Errorf("create postgres pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	return pool, nil
}
