package file

import (
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusPending Status = "pending"
	StatusReady   Status = "ready"
	StatusFailed  Status = "failed"
)

type File struct {
	ID           uuid.UUID
	StorageKey   string
	OriginalName string
	ContentType  string
	Size         int64
	Checksum     *string
	Status       Status
	CreatedAt    time.Time
}
