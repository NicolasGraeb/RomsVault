import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowRight,
  Check,
  Cloud,
  CloudUpload,
  Gamepad2,
  Grid2X2,
  HardDrive,
  Heart,
  Images,
  LayoutGrid,
  List,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { api, ApiError, bytes, message, refreshSession } from './api'
import { Brand, Cover } from './components'
import { GameDialog } from './GameDialog'
import { UploadDialog } from './UploadDialog'
import { Administration, Sharing } from './Management'
import type { Config, Extension, Game, User } from './types'

type View = 'library' | 'favorites' | 'sharing' | 'admin'
const mobileQuery = window.matchMedia('(max-width: 1023px)')
function subscribeMobile(callback: () => void) {
  mobileQuery.addEventListener('change', callback)
  return () => mobileQuery.removeEventListener('change', callback)
}
function readMobile() {
  return mobileQuery.matches
}
function Auth({
  config,
  authenticated,
}: {
  config: Config
  authenticated: (user: User) => void
}) {
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(e.currentTarget)
    try {
      authenticated(
        await api<User>(register ? '/auth/register' : '/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: data.get('email'),
            password: data.get('password'),
            ...(register ? { name: data.get('name') } : {}),
          }),
        }),
      )
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-page">
      <header className="absolute left-6 top-7 sm:left-10">
        <Brand />
      </header>
      <main className="auth-main">
        <section className="hidden lg:block">
          <div className="mb-5 flex items-center gap-2 text-xs tracking-wide text-accent">
            <Sparkles size={16} /> MIEJSCE NA TWOJE WSPOMNIENIA
          </div>
          <h1 className="max-w-lg text-[56px] font-normal leading-[1.12] tracking-[-2px]">
            Wszystkie Twoje gry.
            <br />
            <span className="text-accent">Jeden dobry adres.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-muted">
            Od pierwszego Game Boya po ulubione klasyki. Przechowuj, porządkuj i
            udostępniaj swoją kolekcję.
          </p>
          <div className="auth-art">
            <div className="art-card art-one">
              <span>PRESS START</span>
              <Gamepad2 size={72} strokeWidth={1} />
              <strong>
                Jeszcze
                <br />
                jedna runda.
              </strong>
            </div>
            <div className="art-card art-two">
              <span>THE COLLECTION</span>
              <Grid2X2 size={65} strokeWidth={1} />
              <strong>
                Twoje małe
                <br />
                wielkie światy.
              </strong>
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck size={16} />
            Prywatna biblioteka. Twoja przestrzeń.
          </p>
        </section>
        <section className="auth-form">
          <span className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Gamepad2 size={26} />
          </span>
          <h2 className="text-[28px] tracking-tight">
            {register ? 'Stwórz swoją bibliotekę' : 'Dobrze Cię widzieć'}
          </h2>
          <p className="mb-7 mt-2 text-sm text-muted">
            {register
              ? 'Twoja kolekcja zaczyna się tutaj.'
              : 'Zaloguj się i wróć do swojej kolekcji.'}
          </p>
          <form onSubmit={submit} className="space-y-4">
            {register && (
              <label className="label">
                Nazwa
                <input
                  className="field"
                  name="name"
                  autoComplete="nickname"
                  placeholder="Jak Cię nazywać?"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
            )}
            <label className="label">
              E-mail
              <input
                className="field"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="ty@example.com"
                required
                maxLength={254}
              />
            </label>
            <label className="label">
              Hasło
              <input
                className="field"
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? 'Minimum 12 znaków' : 'Twoje hasło'}
                required
                minLength={register ? 12 : 1}
                maxLength={72}
              />
            </label>
            {register && (
              <p className="text-xs leading-5 text-muted">
                Użyj co najmniej 12 znaków. Hasło może mieć maksymalnie 72
                bajty.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn-primary !mt-6 w-full !py-3.5"
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <ArrowRight size={18} />
              )}
              {register ? 'Utwórz konto' : 'Zaloguj się'}
            </button>
          </form>
          {config.registration_enabled && (
            <p className="mt-6 text-center text-sm text-muted">
              {register ? 'Masz już konto?' : 'Nie masz jeszcze konta?'}{' '}
              <button
                className="text-link"
                onClick={() => {
                  setRegister(!register)
                  setError('')
                }}
              >
                {register ? 'Zaloguj się' : 'Utwórz konto'}
              </button>
            </p>
          )}
          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-muted">
            <Check size={14} />
            Sesja odnawia się automatycznie
          </p>
        </section>
      </main>
      <footer className="absolute bottom-6 left-0 w-full text-center text-xs text-muted">
        RomVault · Twoja kolekcja, zawsze pod ręką.
      </footer>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [config, setConfig] = useState<Config>({
    registration_enabled: true,
    max_upload_bytes: 50 * 1024 ** 3,
  })
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState('')
  const [games, setGames] = useState<Game[]>([])
  const [extensions, setExtensions] = useState<Extension[]>([])
  const [view, setView] = useState<View>('library')
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState('all')
  const [sort, setSort] = useState('newest')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [upload, setUpload] = useState(false)
  const [selected, setSelected] = useState<Game | null>(null)
  const [sidebar, setSidebar] = useState(false)
  const mobile = useSyncExternalStore(subscribeMobile, readMobile)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [sharedOwner, setSharedOwner] = useState('')
  const [shareToken, setShareToken] = useState(() =>
    window.location.hash.startsWith('#/share/')
      ? window.location.hash.slice(8)
      : '',
  )
  const shared = !!shareToken
  const base = shared ? `/api/shared/${encodeURIComponent(shareToken)}` : '/api'
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [user, view, shareToken])
  useEffect(() => {
    const change = () =>
      setShareToken(
        window.location.hash.startsWith('#/share/')
          ? window.location.hash.slice(8)
          : '',
      )
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => {
    let active = true
    async function boot() {
      try {
        const cfg = await api<Config>('/config')
        if (active) setConfig(cfg)
        if (!shareToken) {
          try {
            const me = await api<User>('/auth/me')
            if (active) setUser(me)
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 401)) throw e
          }
        }
      } catch (e) {
        if (active) setBootError(message(e))
      } finally {
        if (active) setBooting(false)
      }
    }
    void boot()
    return () => {
      active = false
    }
  }, [shareToken])
  useEffect(() => {
    let active = true
    async function load() {
      try {
        if (shareToken) {
          const result = await api<{ owner: string; games: Game[] }>(
            `/shared/${encodeURIComponent(shareToken)}`,
          )
          if (active) {
            setGames(result.games)
            setSharedOwner(result.owner)
          }
        } else if (user) {
          const [collection, formats] = await Promise.all([
            api<Game[]>('/games'),
            api<Extension[]>('/extensions'),
          ])
          if (active) {
            setGames(collection)
            setExtensions(formats)
          }
        }
        if (active) setError('')
      } catch (e) {
        if (active) setError(message(e))
      } finally {
        if (active) setLoading(false)
      }
    }
    if (user || shareToken) void load()
    return () => {
      active = false
    }
  }, [user, shareToken, revision])
  useEffect(() => {
    if (!user) return
    const expired = () => {
      setUser(null)
      setGames([])
      setSelected(null)
      setUpload(false)
    }
    const renew = () => {
      if (document.visibilityState === 'visible')
        void refreshSession().catch((e) => {
          if (e instanceof ApiError && e.status === 401) expired()
        })
    }
    const timer = window.setInterval(renew, 10 * 60 * 1000)
    window.addEventListener('session-expired', expired)
    window.addEventListener('focus', renew)
    return () => {
      clearInterval(timer)
      window.removeEventListener('session-expired', expired)
      window.removeEventListener('focus', renew)
    }
  }, [user])
  function reload() {
    setRevision((prev) => prev + 1)
  }
  function navigate(next: View) {
    setView(next)
    setSidebar(false)
    setSearch('')
    setPlatform('all')
  }
  async function favorite(game: Game) {
    try {
      const updated = await api<Game>(`/games/${game.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ favorite: !game.favorite }),
      })
      setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)))
    } catch (e) {
      setError(message(e))
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
      setGames([])
      setView('library')
    } catch (e) {
      setError(message(e))
    }
  }
  if (booting)
    return (
      <div className="grid min-h-screen place-content-center gap-5">
        <Brand />
        <LoaderCircle className="mx-auto animate-spin text-accent" />
      </div>
    )
  if (bootError)
    return (
      <div className="grid min-h-screen place-content-center gap-5 px-6 text-center">
        <Brand />
        <p className="error" role="alert">
          {bootError}
        </p>
        <button className="btn-secondary" onClick={() => location.reload()}>
          Spróbuj ponownie
        </button>
      </div>
    )
  if (!user && !shared) return <Auth config={config} authenticated={setUser} />
  const platforms = [...new Set(games.map((g) => g.platform))].sort()
  const filtered = games
    .filter(
      (g) =>
        (view !== 'favorites' || g.favorite) &&
        (platform === 'all' || g.platform === platform) &&
        `${g.title} ${g.platform} ${g.original_name}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, 'pl')
        : sort === 'size'
          ? b.size - a.size
          : Date.parse(b.created_at) - Date.parse(a.created_at),
    )
  const totalBytes = games.reduce((sum, g) => sum + g.size, 0)
  const heading = shared
    ? `Biblioteka ${sharedOwner}`
    : view === 'favorites'
      ? 'Ulubione'
      : view === 'sharing'
        ? 'Udostępnianie'
        : view === 'admin'
          ? 'Administracja'
          : 'Twoja biblioteka'
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="flex w-auto shrink-0 items-center gap-2 lg:w-[232px]">
          <button
            className="icon-btn lg:!hidden"
            aria-label="Otwórz menu"
            aria-expanded={sidebar}
            onClick={() => setSidebar(!sidebar)}
          >
            <Menu size={23} />
          </button>
          <Brand />
        </div>
        <div className="search-box">
          <Search size={21} className="shrink-0 text-[#c4c7c5]" />
          <input
            aria-label="Szukaj w bibliotece"
            placeholder="Szukaj gier, platform, wspomnień…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              if (view === 'sharing' || view === 'admin') setView('library')
            }}
          />
          {search && (
            <button
              aria-label="Wyczyść wyszukiwanie"
              onClick={() => setSearch('')}
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {!shared && (
            <button
              className="header-upload"
              aria-label="Prześlij gry"
              onClick={() => setUpload(true)}
            >
              <CloudUpload size={21} />
              <span className="hidden xl:inline">Prześlij</span>
            </button>
          )}
          <span className="hidden text-[#747775] sm:block">│</span>
          <span
            className="avatar"
            title={shared ? 'Biblioteka udostępniona' : user?.email}
          >
            {shared ? (
              <Share2 size={19} />
            ) : (
              user?.name.slice(0, 1).toUpperCase()
            )}
          </span>
        </div>
      </header>
      {sidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="Zamknij menu"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        inert={mobile && !sidebar}
        className={`sidebar ${sidebar ? 'open' : ''}`}
      >
        {!shared && (
          <button
            className="create-btn"
            onClick={() => {
              setUpload(true)
              setSidebar(false)
            }}
          >
            <Plus size={23} />
            Dodaj gry
          </button>
        )}
        <nav className="mt-5 space-y-1" aria-label="Menu główne">
          <button
            className={`nav-item ${view === 'library' ? 'active' : ''}`}
            onClick={() => navigate('library')}
          >
            <Images size={21} />
            <span>Biblioteka</span>
            <span className="ml-auto text-xs opacity-70">{games.length}</span>
          </button>
          {!shared && (
            <>
              <button
                className={`nav-item ${view === 'favorites' ? 'active' : ''}`}
                onClick={() => navigate('favorites')}
              >
                <Star size={21} />
                <span>Ulubione</span>
              </button>
              <button
                className={`nav-item ${view === 'sharing' ? 'active' : ''}`}
                onClick={() => navigate('sharing')}
              >
                <Share2 size={21} />
                <span>Udostępnianie</span>
              </button>
              <div className="!my-5 mx-4 border-t border-white/10" />
              {user?.role === 'admin' && (
                <button
                  className={`nav-item ${view === 'admin' ? 'active' : ''}`}
                  onClick={() => navigate('admin')}
                >
                  <Settings2 size={21} />
                  <span>Administracja</span>
                </button>
              )}
            </>
          )}
        </nav>
        <div className="mx-4 mt-7">
          <div className="flex items-center gap-3 text-sm text-[#c4c7c5]">
            <Cloud size={20} />
            {shared ? 'Biblioteka udostępniona' : 'Miejsce na wspomnienia'}
          </div>
          <div className="mt-4 flex h-1 overflow-hidden rounded-full bg-white/10">
            <span className="w-full rounded-full bg-[#a8c7fa]" />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            {bytes(totalBytes)} w kolekcji
            <br />
            {games.length} {games.length === 1 ? 'gra' : 'gier'} ·{' '}
            {platforms.length}{' '}
            {platforms.length === 1 ? 'platforma' : 'platform'}
          </p>
        </div>
        <div className="sidebar-bottom">
          {!shared ? (
            <>
              <div className="mb-3 flex items-center gap-2 text-xs text-muted">
                <ShieldCheck size={15} />
                Twoja prywatna kolekcja
              </div>
              <button
                className="flex items-center gap-3 text-sm text-muted hover:text-white"
                onClick={() => void logout()}
              >
                <LogOut size={17} />
                Wyloguj się
              </button>
            </>
          ) : (
            <a href="/" className="text-link text-sm">
              Przejdź do RomVault <ArrowRight size={14} />
            </a>
          )}
          <p className="mt-5 text-[10px] tracking-wide text-[#747775]">
            MAŁE PLIKI. WIELKIE WSPOMNIENIA.
          </p>
        </div>
      </aside>
      <main className="main-content">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-[#81c995]" />
              {shared
                ? 'Dostęp tylko do odczytu'
                : 'Twoja kolekcja, w jednym miejscu'}
            </div>
            <h1 className="text-[28px] font-normal tracking-[-.6px] sm:text-[32px]">
              {heading}
            </h1>
          </div>
          {!shared && (view === 'library' || view === 'favorites') && (
            <button
              className="btn-secondary mt-2 !rounded-full"
              onClick={() => navigate('sharing')}
            >
              <Share2 size={16} />
              <span className="hidden sm:inline">Udostępnij bibliotekę</span>
              <span className="sm:hidden">Udostępnij</span>
            </button>
          )}
        </div>
        {error && (
          <div
            className="error mb-5 flex items-center justify-between gap-4"
            role="alert"
          >
            <span>{error}</span>
            <button className="shrink-0 underline" onClick={reload}>
              Ponów
            </button>
          </div>
        )}
        {view === 'sharing' && !shared ? (
          <Sharing />
        ) : view === 'admin' && user?.role === 'admin' && !shared ? (
          <Administration extensions={extensions} reload={reload} />
        ) : (
          <>
            <div className="mb-7 flex gap-2 overflow-x-auto pb-2">
              <button
                className={`chip ${platform === 'all' ? 'selected' : ''}`}
                onClick={() => setPlatform('all')}
              >
                <LayoutGrid size={15} />
                Wszystkie gry
              </button>
              {platforms.map((p) => (
                <button
                  className={`chip ${platform === p ? 'selected' : ''}`}
                  key={p}
                  onClick={() => setPlatform(p)}
                >
                  <Gamepad2 size={15} />
                  {p}
                </button>
              ))}
            </div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px]">
                  {search
                    ? 'Wyniki wyszukiwania'
                    : platform !== 'all'
                      ? platform
                      : view === 'favorites'
                        ? 'Zawsze warto wrócić'
                        : 'Wszystkie wspomnienia'}
                </h2>
                <span className="text-xs text-muted">
                  {filtered.length} {filtered.length === 1 ? 'gra' : 'gier'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <ArrowDownWideNarrow size={15} />
                  <select
                    className="sort-select"
                    value={sort}
                    aria-label="Sortowanie gier"
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="newest">Ostatnio dodane</option>
                    <option value="title">Alfabetycznie</option>
                    <option value="size">Największe pliki</option>
                  </select>
                </label>
                <div className="flex rounded-lg border border-white/10 p-0.5">
                  <button
                    aria-label="Widok siatki"
                    aria-pressed={layout === 'grid'}
                    className={`view-btn ${layout === 'grid' ? 'selected' : ''}`}
                    onClick={() => setLayout('grid')}
                  >
                    <Grid2X2 size={16} />
                  </button>
                  <button
                    aria-label="Widok listy"
                    aria-pressed={layout === 'list'}
                    className={`view-btn ${layout === 'list' ? 'selected' : ''}`}
                    onClick={() => setLayout('list')}
                  >
                    <List size={17} />
                  </button>
                </div>
              </div>
            </div>
            {loading ? (
              <div className="game-grid" aria-label="Ładowanie gier">
                {Array.from({ length: 8 }, (_, i) => (
                  <div
                    key={i}
                    className="aspect-[3/4] animate-pulse rounded-xl bg-white/5"
                  />
                ))}
              </div>
            ) : filtered.length ? (
              layout === 'grid' ? (
                <div className="game-grid">
                  {filtered.map((game) => (
                    <article className="game-card group" key={game.id}>
                      <button
                        className="block w-full text-left"
                        onClick={() => setSelected(game)}
                        aria-label={`Otwórz ${game.title}`}
                      >
                        <Cover game={game} base={base} />
                        <div className="px-1 pb-2 pt-3">
                          <h3 className="truncate text-[14px] font-medium text-[#e3e3e3]">
                            {game.title}
                          </h3>
                          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
                            <span className="truncate">{game.platform}</span>
                            <span className="shrink-0">{bytes(game.size)}</span>
                          </div>
                        </div>
                      </button>
                      <span className="format-badge">
                        {game.extension.slice(1).toUpperCase()}
                      </span>
                      {!shared && (
                        <button
                          className={`favorite-btn ${game.favorite ? 'is-favorite' : ''}`}
                          aria-label={`${game.favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}: ${game.title}`}
                          aria-pressed={game.favorite}
                          onClick={() => void favorite(game)}
                        >
                          <Star
                            size={17}
                            fill={game.favorite ? 'currentColor' : 'none'}
                          />
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((game) => (
                    <button
                      key={game.id}
                      className="game-row"
                      onClick={() => setSelected(game)}
                    >
                      <div className="w-12 shrink-0 overflow-hidden rounded-lg">
                        <Cover game={game} base={base} />
                      </div>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm">
                          {game.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {game.platform}
                        </span>
                      </span>
                      <span className="hidden rounded-md bg-white/5 px-2 py-1 text-[10px] uppercase text-muted sm:inline">
                        {game.extension}
                      </span>
                      <span className="w-20 text-right text-xs text-muted">
                        {bytes(game.size)}
                      </span>
                      {game.favorite && (
                        <Star
                          size={15}
                          className="text-yellow-200"
                          fill="currentColor"
                        />
                      )}
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="empty-state">
                <div className="empty-illustration">
                  {search ? (
                    <Search size={47} strokeWidth={1.2} />
                  ) : view === 'favorites' ? (
                    <Heart size={47} strokeWidth={1.2} />
                  ) : (
                    <Gamepad2 size={52} strokeWidth={1.2} />
                  )}
                </div>
                <h2 className="mt-6 text-2xl">
                  {search || platform !== 'all'
                    ? 'Nie znaleziono gier'
                    : view === 'favorites'
                      ? 'Najlepsze gry zasługują na gwiazdkę'
                      : 'Każda kolekcja ma swój początek'}
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
                  {search || platform !== 'all'
                    ? 'Spróbuj innej nazwy lub wybierz wszystkie platformy.'
                    : view === 'favorites'
                      ? 'Oznacz gry gwiazdką, aby mieć swoje ulubione tytuły zawsze pod ręką.'
                      : shared
                        ? 'W tej bibliotece nie ma jeszcze gier.'
                        : 'Dodaj pierwszy ROM, wybierz okładkę i daj swoim ulubionym grom własne miejsce.'}
                </p>
                {!shared &&
                  !search &&
                  platform === 'all' &&
                  view === 'library' && (
                    <button
                      className="btn-primary mx-auto mt-6"
                      onClick={() => setUpload(true)}
                    >
                      <Plus size={18} />
                      Dodaj pierwszą grę
                    </button>
                  )}
                {(search || platform !== 'all') && (
                  <button
                    className="text-link mx-auto mt-5"
                    onClick={() => {
                      setSearch('')
                      setPlatform('all')
                    }}
                  >
                    Wyczyść filtry
                  </button>
                )}
                <div className="mt-12 flex flex-wrap justify-center gap-5 text-[11px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <HardDrive size={14} />
                    ROM-y i obrazy ISO
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Shield size={14} />
                    Sprawdzanie SHA-256
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Images size={14} />
                    Twoje okładki
                  </span>
                </div>
              </div>
            )}
          </>
        )}
        {!loading &&
          filtered.length > 0 &&
          (view === 'library' || view === 'favorites') && (
            <footer className="mt-12 flex items-center justify-center gap-2 pb-3 text-[11px] text-[#747775]">
              <ShieldCheck size={14} />
              {filtered.length} {filtered.length === 1 ? 'gra' : 'gier'} ·
              Gotowe na kolejną rundę
            </footer>
          )}
      </main>
      {upload && !shared && (
        <UploadDialog
          extensions={extensions}
          maxBytes={config.max_upload_bytes}
          close={() => setUpload(false)}
          saved={reload}
        />
      )}
      {selected && (
        <GameDialog
          key={selected.id}
          game={selected}
          base={base}
          shared={shared}
          close={() => setSelected(null)}
          saved={reload}
        />
      )}
    </div>
  )
}
export default App
