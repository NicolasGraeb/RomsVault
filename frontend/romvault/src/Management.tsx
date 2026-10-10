import { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Link2,
  LoaderCircle,
  Plus,
  Shield,
  Trash2,
} from 'lucide-react'
import { api, date, message } from './api'
import type { Extension, Share } from './types'

export function Sharing() {
  const [shares, setShares] = useState<Share[]>([])
  const [label, setLabel] = useState('Moja kolekcja')
  const [days, setDays] = useState(30)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState('')
  useEffect(() => {
    api<Share[]>('/shares')
      .then(setShares)
      .catch((e) => setError(message(e)))
      .finally(() => setBusy(false))
  }, [])
  async function create() {
    setBusy(true)
    setError('')
    try {
      const result = await api<{ share: Share; url: string }>('/shares', {
        method: 'POST',
        body: JSON.stringify({ label, days }),
      })
      setShares((prev) => [result.share, ...prev])
      setUrl(result.url)
      setCopied(false)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  async function remove(id: string) {
    setBusy(true)
    try {
      await api(`/shares/${id}`, { method: 'DELETE' })
      setShares((prev) => prev.filter((s) => s.id !== id))
      setDeleting('')
      setUrl('')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="max-w-3xl">
      <div className="surface p-6 sm:p-8">
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Link2 size={24} />
        </div>
        <h2 className="text-xl">Twoje gry, wspólna przyjemność.</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Utwórz link do całej biblioteki. Każda osoba z linkiem może przeglądać
          okładki i pobierać gry, bez zakładania konta. Nowe gry pojawią się
          automatycznie.
        </p>
        <form
          className="mt-6 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <label className="label min-w-40 flex-1">
            Nazwa linku
            <input
              className="field"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              required
            />
          </label>
          <label className="label">
            Ważność
            <select
              className="field"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={1}>1 dzień</option>
              <option value={7}>7 dni</option>
              <option value={30}>30 dni</option>
              <option value={90}>90 dni</option>
              <option value={365}>1 rok</option>
            </select>
          </label>
          <button className="btn-primary h-[46px]" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="animate-spin" />
            ) : (
              <Plus size={17} />
            )}
            Utwórz link
          </button>
        </form>
        {url && (
          <div className="mt-5 rounded-xl border border-accent/20 bg-accent/5 p-4">
            <p className="mb-2 text-xs text-muted">
              Skopiuj teraz — pełny link jest pokazywany tylko raz.
            </p>
            <div className="flex items-center gap-2">
              <input
                className="field min-w-0 flex-1 !text-xs"
                aria-label="Link do udostępnionej biblioteki"
                value={url}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <button
                className="icon-btn text-accent"
                aria-label="Kopiuj link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url)
                    setCopied(true)
                  } catch {
                    setError('Zaznacz link i skopiuj go ręcznie.')
                  }
                }}
              >
                {copied ? <Check size={19} /> : <Copy size={19} />}
              </button>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p className="error mt-4" role="alert">
          {error}
        </p>
      )}
      <h3 className="mb-4 mt-9 text-base">
        Twoje linki <span className="ml-2 text-muted">{shares.length}</span>
      </h3>
      {!shares.length && !busy && (
        <p className="py-8 text-sm text-muted">
          Nie udostępniasz jeszcze swojej biblioteki.
        </p>
      )}
      <div className="space-y-2">
        {shares.map((share) => (
          <div
            className="surface flex flex-wrap items-center gap-4 p-4"
            key={share.id}
          >
            <Link2 className="text-muted" size={20} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{share.label}</p>
              <p className="mt-1 text-xs text-muted">
                {new Date(share.expires_at) < new Date()
                  ? 'Wygasł'
                  : 'Ważny do'}{' '}
                {date(share.expires_at)}
              </p>
            </div>
            {deleting === share.id ? (
              <>
                <button
                  className="text-sm text-red-300"
                  disabled={busy}
                  onClick={() => void remove(share.id)}
                >
                  Cofnij dostęp
                </button>
                <button
                  className="text-sm text-muted"
                  onClick={() => setDeleting('')}
                >
                  Anuluj
                </button>
              </>
            ) : (
              <button
                className="icon-btn"
                aria-label={`Wyłącz link ${share.label}`}
                onClick={() => setDeleting(share.id)}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Administration({
  extensions,
  reload,
}: {
  extensions: Extension[]
  reload: () => void
}) {
  const [extension, setExtension] = useState('')
  const [platform, setPlatform] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(value: Extension) {
    setBusy(true)
    setError('')
    try {
      await api('/admin/extensions', {
        method: 'PUT',
        body: JSON.stringify(value),
      })
      reload()
      setExtension('')
      setPlatform('')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="max-w-3xl">
      <div className="surface p-6">
        <h2 className="flex items-center gap-3 text-lg">
          <Shield className="text-accent" size={22} />
          Obsługiwane formaty
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Dodawaj rozszerzenia i przypisuj im domyślną platformę. Wyłączenie
          formatu blokuje nowe uploady; istniejące gry nadal można pobierać. Aby
          zmienić platformę, zapisz ponownie to samo rozszerzenie.
        </p>
        <form
          className="mt-6 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save({
              extension: extension.startsWith('.')
                ? extension
                : `.${extension}`,
              platform,
              enabled: true,
            })
          }}
        >
          <label className="label w-28">
            Rozszerzenie
            <input
              className="field"
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
              placeholder=".iso"
              required
              maxLength={13}
              pattern="\.?[A-Za-z0-9]{1,12}"
            />
          </label>
          <label className="label min-w-40 flex-1">
            Platforma
            <input
              className="field"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="PlayStation 2"
              required
              maxLength={80}
            />
          </label>
          <button className="btn-primary h-[46px]" disabled={busy}>
            <Plus size={17} />
            Zapisz format
          </button>
        </form>
      </div>
      {error && (
        <p className="error mt-4" role="alert">
          {error}
        </p>
      )}
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
        <div className="grid grid-cols-[80px_1fr_80px] gap-3 bg-white/5 px-5 py-3 text-xs text-muted">
          <span>Format</span>
          <span>Platforma</span>
          <span className="text-right">Aktywny</span>
        </div>
        {extensions.map((e) => (
          <div
            key={e.extension}
            className="grid grid-cols-[80px_1fr_80px] items-center gap-3 border-t border-white/5 px-5 py-3"
          >
            <span className="font-mono text-sm text-accent">{e.extension}</span>
            <span className="text-sm">{e.platform}</span>
            <button
              type="button"
              role="switch"
              aria-checked={e.enabled}
              aria-label={`Format ${e.extension}`}
              disabled={busy}
              className={`toggle ml-auto ${e.enabled ? 'enabled' : ''}`}
              onClick={() => void save({ ...e, enabled: !e.enabled })}
            >
              <span />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
