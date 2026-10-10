package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	HTTP                                           HTTPConfig
	Database                                       DatabaseConfig
	S3                                             S3Config
	RedisURL, AppOrigin, AdminEmail, AdminPassword string
	CookieSecure, RegistrationEnabled, TrustProxy  bool
	MaxUploadBytes                                 int64
	MaxConcurrentUploads                           int
}
type HTTPConfig struct {
	Host string
	Port int
}
type DatabaseConfig struct {
	URL      string
	MaxConns int32
}
type S3Config struct{ Endpoint, Bucket, AccessKey, SecretKey, Region string }

func Load() (Config, error) {
	port, err := strconv.Atoi(env("HTTP_PORT", "8001"))
	if err != nil || port < 1 || port > 65535 {
		return Config{}, fmt.Errorf("HTTP_PORT must be between 1 and 65535")
	}
	maxGB, err := strconv.ParseInt(env("MAX_UPLOAD_GB", "50"), 10, 64)
	if err != nil || maxGB < 1 || maxGB > 1024 {
		return Config{}, fmt.Errorf("MAX_UPLOAD_GB must be between 1 and 1024")
	}
	uploads, err := strconv.Atoi(env("MAX_CONCURRENT_UPLOADS", "2"))
	if err != nil || uploads < 1 || uploads > 32 {
		return Config{}, fmt.Errorf("MAX_CONCURRENT_UPLOADS must be between 1 and 32")
	}
	connections, err := strconv.Atoi(env("DATABASE_POOL_MAX_CONNS", "10"))
	if err != nil || connections < 2 || connections > 100 {
		return Config{}, fmt.Errorf("DATABASE_POOL_MAX_CONNS must be between 2 and 100")
	}
	c := Config{
		HTTP: HTTPConfig{env("HTTP_HOST", "0.0.0.0"), port}, Database: DatabaseConfig{os.Getenv("DATABASE_URL"), int32(connections)},
		MaxConcurrentUploads: uploads,
		S3:                   S3Config{os.Getenv("S3_ENDPOINT"), env("S3_BUCKET", "romvault"), os.Getenv("S3_ACCESS_KEY"), os.Getenv("S3_SECRET_KEY"), env("S3_REGION", "us-east-1")},
		RedisURL:             env("REDIS_URL", "redis://localhost:6379/0"), AppOrigin: strings.TrimRight(env("APP_ORIGIN", "http://localhost:8080"), "/"),
		AdminEmail: strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL"))), AdminPassword: os.Getenv("ADMIN_PASSWORD"), MaxUploadBytes: maxGB << 30,
	}
	for name, target := range map[string]*bool{"COOKIE_SECURE": &c.CookieSecure, "REGISTRATION_ENABLED": &c.RegistrationEnabled, "TRUST_PROXY": &c.TrustProxy} {
		fallback := "false"
		if name == "REGISTRATION_ENABLED" {
			fallback = "true"
		}
		*target, err = strconv.ParseBool(env(name, fallback))
		if err != nil {
			return Config{}, fmt.Errorf("%s must be true or false", name)
		}
	}
	for name, value := range map[string]string{"DATABASE_URL": c.Database.URL, "S3_ENDPOINT": c.S3.Endpoint, "S3_ACCESS_KEY": c.S3.AccessKey, "S3_SECRET_KEY": c.S3.SecretKey} {
		if value == "" {
			return Config{}, fmt.Errorf("required environment variable %s is missing", name)
		}
	}
	u, err := url.Parse(c.AppOrigin)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.User != nil {
		return Config{}, fmt.Errorf("APP_ORIGIN must be an HTTP(S) origin without a path")
	}
	if (c.AdminEmail == "") != (c.AdminPassword == "") {
		return Config{}, fmt.Errorf("set ADMIN_EMAIL and ADMIN_PASSWORD together")
	}
	if c.AdminPassword != "" && (len(c.AdminPassword) < 12 || len(c.AdminPassword) > 72) {
		return Config{}, fmt.Errorf("ADMIN_PASSWORD must contain 12–72 bytes")
	}
	return c, nil
}
func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
