package file

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("file not found")

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{
		db: db,
	}
}

func (r *PostgresRepository) Create(
	ctx context.Context,
	file *File,
) error {
	_, err := r.db.Exec(
		ctx,
		`
		INSERT INTO files (
			id,
			storage_key,
			original_name,
			content_type,
			size,
			checksum,
			status
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		`,
		file.ID,
		file.StorageKey,
		file.OriginalName,
		file.ContentType,
		file.Size,
		file.Checksum,
		file.Status,
	)

	if err != nil {
		return fmt.Errorf("create file metadata: %w", err)
	}

	return nil
}

func (r *PostgresRepository) GetByID(
	ctx context.Context,
	id uuid.UUID,
) (*File, error) {
	var file File

	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			id,
			storage_key,
			original_name,
			content_type,
			size,
			checksum,
			status,
			created_at
		FROM files
		WHERE id = $1
		`,
		id,
	).Scan(
		&file.ID,
		&file.StorageKey,
		&file.OriginalName,
		&file.ContentType,
		&file.Size,
		&file.Checksum,
		&file.Status,
		&file.CreatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}

	if err != nil {
		return nil, fmt.Errorf("get file metadata: %w", err)
	}

	return &file, nil
}

func (r *PostgresRepository) List(
	ctx context.Context,
) ([]File, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			id,
			storage_key,
			original_name,
			content_type,
			size,
			checksum,
			status,
			created_at
		FROM files
		ORDER BY created_at DESC
		`,
	)
	if err != nil {
		return nil, fmt.Errorf("list files: %w", err)
	}
	defer rows.Close()

	files := make([]File, 0)

	for rows.Next() {
		var file File

		err := rows.Scan(
			&file.ID,
			&file.StorageKey,
			&file.OriginalName,
			&file.ContentType,
			&file.Size,
			&file.Checksum,
			&file.Status,
			&file.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan file metadata: %w", err)
		}

		files = append(files, file)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate files: %w", err)
	}

	return files, nil
}

func (r *PostgresRepository) Delete(
	ctx context.Context,
	id uuid.UUID,
) error {
	result, err := r.db.Exec(
		ctx,
		`
		DELETE FROM files
		WHERE id = $1
		`,
		id,
	)
	if err != nil {
		return fmt.Errorf("delete file metadata: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}
