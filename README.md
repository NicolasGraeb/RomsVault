# RomVault

Prywatna biblioteka ROM-ów: Go + PostgreSQL + Redis + SeaweedFS oraz React 19, React Compiler i Tailwind CSS 4. Polski interfejs w ciemnej stylistyce Google Photos, z siatką okładek i widokiem mobilnym.

## Uruchomienie całej aplikacji

Wymagany Docker z Compose. W PowerShell, z katalogu projektu:

```powershell
./scripts/setup.ps1
docker compose up -d --build
```

Otwórz **http://localhost:8080**. Skrypt tworzy lokalny `.env` z losowymi hasłami; nie nadpisuje istniejącego pliku. Konto administratora tworzy się przy pierwszym starcie. Jego login i hasło znajdziesz w `ADMIN_EMAIL` i `ADMIN_PASSWORD` w `.env`. Zwykłe konta można tworzyć przez formularz rejestracji.

Na Linux/macOS skopiuj `.env.example` do `.env`, ustaw własne losowe hasła i uruchom tę samą komendę Compose. Dla haseł infrastruktury używaj liter, cyfr, `_` i `-` (np. wynik `openssl rand -hex 32`).

```powershell
docker compose ps
docker compose logs -f backend
docker compose stop
```

`docker compose down` zachowuje dane w wolumenach. Opcja `-v` usuwa dane i nie jest potrzebna do aktualizacji aplikacji. Nowa konfiguracja używa wolumenów `app_postgres`, `app_redis`, `app_seaweed`; wcześniejsze wolumeny ze szkieletu projektu nie są usuwane ani automatycznie migrowane.

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

## Biblioteka i pliki

- Wgrywanie wielu plików, przeciąganie do formularza, kolejka, postęp, anulowanie i ponawianie. Domyślnie 31 formatów: ISO, BIN/CUE, CHD, CSO, PBP, NES, SFC/SMC, GB/GBC/GBA, NDS, 3DS/CIA, N64/Z64/V64, GCM/RVZ/WBFS, WUD/WUX, XCI/NSP, MD/GEN/SMS/GG, ZIP/7z.
- Edycja tytułu i platformy, ulubione, wyszukiwanie, filtrowanie, sortowanie oraz siatka/lista. Biblioteka nowego użytkownika jest pusta - aplikacja nie dodaje przykładowych gier.
- Okładki JPG/PNG do 10 MiB i 24 megapikseli. Backend odczytuje obraz i zapisuje go ponownie jako JPEG, usuwając metadane i aktywną zawartość.
- Administrator może dodawać nowe rozszerzenia, ustalać platformę domyślną i wyłączać formaty. Wyłączenie blokuje nowe uploady, zachowując pobieranie istniejących plików.
- Zestawy BIN/CUE należy dodawać razem. Foldery i wieloczęściowe struktury można przechowywać jako ZIP/7z. Serwer przechowuje pliki, nie uruchamia emulatora ani nie rozpakowuje archiwów.
- Wygasające linki do całej biblioteki (1–365 dni), dostęp bez konta tylko do odczytu i pobierania. Link można unieważnić natychmiast. Obejmuje również gry dodane później. Pełny link jest wyświetlany raz, a w bazie przechowywany jest hash tokenu.

## Integralność, idempotencja i sesje

SHA-256 jest obliczany fragmentami w przeglądarce, a następnie niezależnie podczas strumieniowania do SeaweedFS. Niezgodność daje HTTP 422 i nie zapisuje gry w bibliotece. Klient S3 używa również Content-MD5 przy wysyłaniu części. ISO nie jest w całości buforowane w pamięci aplikacji.

Pobieranie obsługuje HTTP Range, ETag, `X-Checksum-SHA256`, `Repr-Digest` i osobny plik `.sha256`. W szczegółach gry przycisk **Sprawdź pobrany plik** porównuje lokalny plik z oryginalną sumą, czytając go fragmentami po 4 MiB. Standardowe pobieranie przeglądarki nie wykonuje tej końcowej weryfikacji automatycznie - użyj przycisku lub narzędzia:

```powershell
Get-FileHash -Algorithm SHA256 ./gra.iso
```

Upload wymaga `Idempotency-Key` (UUID) i sumy SHA-256. Redis blokuje równoczesne operacje z tym samym kluczem. PostgreSQL przechowuje klucz i odcisk metadanych z gry: identyczne ponowienie zwraca pierwotny rekord, a zmienione żądanie daje 409. Unikalna suma na użytkownika blokuje także dodanie duplikatu z nowym kluczem. Klucz pozostaje ważny przez czas istnienia rekordu gry. Ponawianie wysyła cały plik ponownie; upload nie wznawia się od przerwanego bajtu. Pobieranie obsługuje wznawianie.

Hasła kont są haszowane bcrypt. Losowe tokeny sesji są przechowywane po stronie bazy wyłącznie jako SHA-256, a po stronie przeglądarki w ciasteczkach HttpOnly / SameSite=Lax. Access token jest ważny 15 minut. Rotowany refresh token przedłuża sesję do 30 dni od użycia, maksymalnie do 90 dni od logowania. Frontend odnawia sesję co 10 minut aktywności, przy powrocie do okna i po 401. Chwilowy błąd sieci nie usuwa lokalnego stanu logowania. Równoległe karty mają 60-sekundowy okres tolerancji dla poprzedniego tokenu. Wylogowanie unieważnia sesję w bazie.

Redis pełni trzy role: cache listy gier (2 minuty, klucze z wersją biblioteki aktualizowaną w transakcji), blokady idempotencji i limity prób logowania. Awaria cache nie blokuje odczytu biblioteki; logowanie i nowe uploady wymagają działającego Redisa. Cache nie zastępuje sprawdzania uprawnień ani ważności linków. Redis używa `noeviction`, aby presja pamięci nie usuwała aktywnych blokad.

Usuwanie gry i wymiana okładki zapisują trwałą kolejkę sprzątania obiektów w PostgreSQL. Worker ponawia usuwanie co minutę po awarii magazynu. Logi HTTP są strukturalne i zawierają wzorce tras, statusy, czas oraz request ID. Uploady logują powodzenie, ponowienie i błąd integralności. Logi aplikacji nie zapisują haseł, ciasteczek ani tokenów linków.

## Praca lokalna z Go i Vite

Zatrzymaj kontenery aplikacji, jeżeli już działają, i wystaw tylko zależności:

```powershell
docker compose stop frontend backend
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d postgres redis seaweedfs
./scripts/dev-backend.ps1
```

W drugim terminalu:

```powershell
cd frontend/romvault
npm ci
npm run dev
```

Otwórz `http://localhost:5173`. Skrypt ustawia zmienne procesu z głównego `.env`, nie nadpisując wcześniejszego `backend/.env`. Przy innym porcie Go ustaw `API_PORT` w `.env` oraz `API_PROXY_TARGET=http://localhost:PORT` w środowisku Vite. Inny adres Vite przekaż jako `./scripts/dev-backend.ps1 -Origin http://localhost:5174`.

React Compiler jest włączony przez istniejący `reactCompilerPreset()` i plugin Babel. Tailwind działa przez `@tailwindcss/vite`, bez CDN i bez zewnętrznych fontów.

## Weryfikacja

```powershell
cd backend
go test ./...
go vet ./...
cd ../frontend/romvault
npm run lint
npm run build
cd ../..
node scripts/smoke.mjs
```

Smoke test wymaga uruchomionego Compose oraz włączonej rejestracji. Sprawdza 28 scenariuszy, m.in. separację kont, CSRF, idempotencję, checksumy, S3 multipart ponad 16 MiB, zakresy pobierania, cache, okładki, odświeżanie sesji, administrację i cofanie udostępniania. Używa syntetycznych danych, bez prawdziwych gier. Opcja `--keep-fixtures` zostawia kilka syntetycznych plików do sprawdzenia UI.

Po teście usuń jego konta i kolejkuj pozostałe obiekty do sprzątania (plik SQL zawiera wyłącznie identyfikatory kont z ostatniego przebiegu):

```powershell
Get-Content artifacts/smoke-cleanup.sql | docker compose exec -T postgres psql -U romvault -d romvault -v ON_ERROR_STOP=1
```

Jeżeli zmienisz nazwę bazy lub użytkownika, dostosuj `-U` i `-d`. Przed kolejnym uruchomieniem testu wykonaj sprzątanie poprzedniego przebiegu. Katalog `artifacts` jest ignorowany.

## Dokumentacja użytych integracji

- [Tailwind CSS - Vite](https://tailwindcss.com/docs/installation/using-vite)
- [MinIO Go - API klienta S3](https://github.com/minio/minio-go/blob/master/docs/API.md)
- [SeaweedFS](https://github.com/seaweedfs/seaweedfs)

To wdrożenie SeaweedFS na jednym węźle. Kopia zapasowa powinna obejmować jednocześnie PostgreSQL i cały wolumen SeaweedFS (dane oraz metadane filera). Rozszerzenie pliku i zgodna suma potwierdzają format nazwy i integralność przesyłania, nie poprawność obrazu dla konkretnego emulatora.
