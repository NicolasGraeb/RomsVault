package file

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	Create(ctx context.Context, file *File) error
	GetByID(ctx context.Context, id uuid.UUID) (*File, error)
	List(ctx context.Context) ([]File, error)
	Delete(ctx context.Context, id uuid.UUID) error
}
