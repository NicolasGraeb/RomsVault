# Frontend RomVault

React 19 + TypeScript + Vite + React Compiler + Tailwind CSS 4.

Instrukcja uruchamiania całej aplikacji, konfiguracja portów i testy znajdują się w [głównym README](../../README.md).

```sh
npm ci
npm run dev
npm run lint
npm run build
npm run format
```

Vite przekazuje `/api` i `/health` do `http://localhost:8001`. Zmień `API_PROXY_TARGET`, aby korzystać z innego portu backendu. Ustaw odpowiednie `APP_ORIGIN` po stronie Go.
