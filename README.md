
## Konfiguracja

Edytuj `.env`, następnie wykonaj `docker compose up -d --build`.

| Zmienna | Znaczenie |
| --- | --- |
| `APP_PORT` | Port frontendu, domyślnie `8080` |
| `BIND_ADDRESS` | Adres nasłuchiwania hosta, domyślnie `127.0.0.1`; `0.0.0.0` udostępnia aplikację w sieci |
| `APP_ORIGIN` | Dokładny adres widoczny w przeglądarce, np. `http://localhost:8090` lub `https://romvault.example.com`; używany także do linków i ochrony CSRF |
| `COOKIE_SECURE` | `true` za HTTPS; `false` tylko przy lokalnym HTTP |
| `REGISTRATION_ENABLED` | Możliwość tworzenia kont |
| `MAX_UPLOAD_GB` | Limit pojedynczego ROM-u w GiB, domyślnie `50`, zakres `1–1024` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Utworzenie administratora przy starcie; istniejące hasło nie jest zmieniane przy restartach |
| `POSTGRES_*`, `REDIS_PASSWORD`, `S3_*` | Dane połączeń i nazwa bucketu; po utworzeniu wolumenu zmiana hasła PostgreSQL wymaga także zmiany w samej bazie |
| `SEAWEED_IMAGE` | Przypięty obraz SeaweedFS, domyślnie `chrislusf/seaweedfs:4.17` |
| `POSTGRES_PORT`, `REDIS_PORT`, `S3_PORT`, `API_PORT` | Porty hosta używane wyłącznie przez nakładkę `docker-compose.dev.yaml` |

Przykład zmiany portu: ustaw jednocześnie `APP_PORT=8090` i `APP_ORIGIN=http://localhost:8090`. Przy publicznej domenie skonfiguruj reverse proxy z HTTPS, `APP_ORIGIN` tej domeny i `COOKIE_SECURE=true`. PostgreSQL, Redis i SeaweedFS są domyślnie dostępne tylko wewnątrz sieci Compose.
