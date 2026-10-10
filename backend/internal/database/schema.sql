CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
 library_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 access_hash text NOT NULL UNIQUE, refresh_hash text NOT NULL UNIQUE,
 previous_access_hash text, previous_refresh_hash text, previous_valid_until timestamptz,
 access_expires_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_previous_refresh ON sessions(previous_refresh_hash);
CREATE INDEX IF NOT EXISTS sessions_previous_access ON sessions(previous_access_hash);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS extensions (extension text PRIMARY KEY, platform text NOT NULL, enabled boolean NOT NULL DEFAULT true);
INSERT INTO extensions(extension,platform) VALUES
('.iso','PlayStation 2'),('.bin','PlayStation'),('.cue','PlayStation'),('.chd','PlayStation'),
('.cso','PSP'),('.pbp','PSP'),('.nes','NES'),('.sfc','SNES'),('.smc','SNES'),
('.gb','Game Boy'),('.gbc','Game Boy Color'),('.gba','Game Boy Advance'),('.nds','Nintendo DS'),
('.3ds','Nintendo 3DS'),('.cia','Nintendo 3DS'),('.n64','Nintendo 64'),('.z64','Nintendo 64'),
('.v64','Nintendo 64'),('.gcm','GameCube'),('.rvz','GameCube / Wii'),('.wbfs','Wii'),
('.wud','Wii U'),('.wux','Wii U'),('.xci','Nintendo Switch'),('.nsp','Nintendo Switch'),
('.md','Mega Drive'),('.gen','Mega Drive'),('.sms','Master System'),('.gg','Game Gear'),
('.zip','Archiwum'),('.7z','Archiwum') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS games (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title text NOT NULL, platform text NOT NULL, original_name text NOT NULL, extension text NOT NULL,
 storage_key text NOT NULL UNIQUE, size bigint NOT NULL CHECK(size > 0), checksum text NOT NULL CHECK(length(checksum) = 64),
 cover_key text NOT NULL DEFAULT '', favorite boolean NOT NULL DEFAULT false,
 idempotency_key text NOT NULL, request_fingerprint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,idempotency_key), UNIQUE(owner_id,checksum)
);
CREATE INDEX IF NOT EXISTS games_owner_created ON games(owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS shares (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, label text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shares_owner ON shares(owner_id);
CREATE TABLE IF NOT EXISTS storage_garbage (storage_key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
