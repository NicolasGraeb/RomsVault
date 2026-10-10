package storage

import (
	"context"
	"fmt"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"io"
	"main/internal/config"
	"net/url"
)

type Store struct {
	Client *minio.Client
	Bucket string
}

func New(ctx context.Context, cfg config.S3Config) (*Store, error) {
	u, err := url.Parse(cfg.Endpoint)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || (u.Path != "" && u.Path != "/") {
		return nil, fmt.Errorf("S3_ENDPOINT must be an HTTP(S) endpoint")
	}
	c, err := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""), Secure: u.Scheme == "https", Region: cfg.Region, BucketLookup: minio.BucketLookupPath})
	if err != nil {
		return nil, err
	}
	exists, err := c.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		if err = c.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{Region: cfg.Region}); err != nil {
			code := minio.ToErrorResponse(err).Code
			if code != "BucketAlreadyOwnedByYou" && code != "BucketAlreadyExists" {
				return nil, err
			}
		}
	}
	return &Store{c, cfg.Bucket}, nil
}
func (s *Store) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	_, err := s.Client.PutObject(ctx, s.Bucket, key, r, size, minio.PutObjectOptions{ContentType: contentType, PartSize: 16 << 20, NumThreads: 1, SendContentMd5: true})
	return err
}
func (s *Store) Open(ctx context.Context, key string) (*minio.Object, error) {
	return s.Client.GetObject(ctx, s.Bucket, key, minio.GetObjectOptions{})
}
func (s *Store) Delete(ctx context.Context, key string) error {
	return s.Client.RemoveObject(ctx, s.Bucket, key, minio.RemoveObjectOptions{})
}
func (s *Store) Ping(ctx context.Context) error {
	exists, err := s.Client.BucketExists(ctx, s.Bucket)
	if err == nil && !exists {
		return fmt.Errorf("bucket missing")
	}
	return err
}
