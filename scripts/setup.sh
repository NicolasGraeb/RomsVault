#!/bin/sh
# Run with: sh scripts/setup.sh --pi --data-dir /mnt/ssd/romvault --origin http://raspberrypi.local:8080
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
pi=false
data_dir=
origin=
port=
usage() {
  echo 'Usage: sh scripts/setup.sh [--pi] [--data-dir /absolute/existing-disk/romvault] [--origin http://host:port] [--port 8080]'
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --pi) pi=true; shift;;
    --data-dir|--origin|--port)
      [ "$#" -ge 2 ] || { usage >&2; exit 1; }
      case "$1" in --data-dir) data_dir=$2;; --origin) origin=$2;; --port) port=$2;; esac
      shift 2;;
    --help|-h) usage; exit 0;;
    *) usage >&2; exit 1;;
  esac
done
if [ -n "$port" ]; then
  case "$port" in *[!0-9]*) echo 'Port must be a number.' >&2; exit 1;; esac
  [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { echo 'Port must be 1-65535.' >&2; exit 1; }
fi
if [ -n "$origin" ]; then
  case "$origin" in http://*|https://*) ;; *) echo 'Origin must start with http:// or https://' >&2; exit 1;; esac
  case "$origin" in *[!a-zA-Z0-9:/._-]*) echo 'Use a plain hostname or IPv4 origin without a path.' >&2; exit 1;; esac
  origin=${origin%/}
fi
if [ -n "$data_dir" ]; then
  data_dir=${data_dir%/}
  case "$data_dir" in /*) ;; *) echo 'DATA_DIR must be an absolute path.' >&2; exit 1;; esac
  case "$data_dir" in *[!a-zA-Z0-9/._-]*|*/../*|*/..|*/./*|*/.) echo 'Use a simple absolute path without spaces, dot segments or special characters.' >&2; exit 1;; esac
  [ -n "$data_dir" ] && [ "$data_dir" != / ] || { echo 'Choose a dedicated subdirectory.' >&2; exit 1; }
  [ -d "$(dirname -- "$data_dir")" ] || { echo 'Parent directory is missing. Mount your disk first, then select a directory on it.' >&2; exit 1; }
fi
umask 077
env_file="$root/.env"
if [ ! -f "$env_file" ]; then
  command -v openssl >/dev/null || { echo 'Install openssl before setup.' >&2; exit 1; }
  # Generate the full configuration in a temporary file. Never source .env as shell code.
  tmp=$(mktemp "$root/.env.setup.XXXXXX")
  trap 'rm -f -- "$tmp"' EXIT HUP INT TERM
  while IFS= read -r line || [ -n "$line" ]; do
    line=$(printf '%s' "$line" | tr -d '\r')
    case "$line" in
      POSTGRES_PASSWORD=*|REDIS_PASSWORD=*|S3_SECRET_KEY=*|ADMIN_PASSWORD=*) printf '%s=%s\n' "${line%%=*}" "$(openssl rand -hex 32)";;
      *) printf '%s\n' "$line";;
    esac
  done < "$root/.env.example" > "$tmp"
  mv -- "$tmp" "$env_file"
  trap - EXIT HUP INT TERM
  echo 'Created .env with random credentials. Admin login is stored in .env.'
else
  echo 'Keeping existing credentials in .env.'
fi
set_value() {
  key=$1 value=$2
  tmp=$(mktemp "$root/.env.setup.XXXXXX")
  awk -v key="$key" -v value="$value" 'BEGIN { done=0 } { sub(/\r$/, ""); if(index($0,key "=")==1) { if(!done) print key "=" value; done=1 } else print } END { if(!done) print key "=" value }' "$env_file" > "$tmp"
  mv -- "$tmp" "$env_file"
}
if [ -n "$data_dir" ]; then
  mkdir -p -- "$data_dir/postgres" "$data_dir/redis" "$data_dir/seaweedfs"
  set_value DATA_DIR "$data_dir"
  echo "Data directory: $data_dir"
  echo 'Existing Docker-volume data is not copied automatically; see docs/storage-and-pi.md.'
fi
if [ "$pi" = true ] || [ -n "$data_dir" ]; then
  compose_files=docker-compose.yaml
  # Preserve already enabled storage/Pi overlays when rerunning with only one option.
  if [ -n "$data_dir" ] || grep -q '^COMPOSE_FILE=.*docker-compose.storage.yaml' "$env_file"; then compose_files="$compose_files:docker-compose.storage.yaml"; fi
  if [ "$pi" = true ] || grep -q '^COMPOSE_FILE=.*docker-compose.rpi.yaml' "$env_file"; then compose_files="$compose_files:docker-compose.rpi.yaml"; fi
  set_value COMPOSE_PATH_SEPARATOR ':'
  set_value COMPOSE_FILE "$compose_files"
fi
if [ "$pi" = true ]; then
  set_value COMPOSE_PARALLEL_LIMIT 1
  echo 'Enabled Pi memory profile and sequential builds. Use a 64-bit OS (aarch64).'
fi
if [ -n "$origin" ]; then set_value APP_ORIGIN "$origin"; set_value BIND_ADDRESS 0.0.0.0; fi
if [ -n "$port" ]; then set_value APP_PORT "$port"; fi
echo 'Ready. Review .env, then run: docker compose up -d --build'
