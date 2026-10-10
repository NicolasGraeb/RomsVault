import { useRef, useState } from 'react'
import {
  CheckCircle2,
  Download,
  ImagePlus,
  LoaderCircle,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react'
import { api, bytes, date, hashFile, message, uploadFile } from './api'
import { Cover, Modal } from './components'
import type { Game } from './types'

async function downloadFile(url: string, shared: boolean) {
  if (!shared) await api('/auth/me')
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = ''
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}
export function GameDialog({
  game,
  base,
  shared,
  close,
  saved,
}: {
  game: Game
  base: string
  shared: boolean
  close: () => void
  saved: (game?: Game) => void
}) {
  const [current, setCurrent] = useState(game)
  const [title, setTitle] = useState(game.title)
  const [platform, setPlatform] = useState(game.platform)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [verification, setVerification] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)
  const verifyInput = useRef<HTMLInputElement>(null)
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  async function update(change: Partial<Game>) {
    const updated = await api<Game>(`/games/${game.id}`, {
      method: 'PATCH',
      body: JSON.stringify(change),
    })
    setCurrent(updated)
    saved(updated)
  }
  async function cover(file: File) {
    if (
      !['image/jpeg', 'image/png'].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    )
      throw new Error('Wybierz okładkę JPG lub PNG do 10 MB.')
    const updated = await uploadFile<Game>(
      `/games/${game.id}/cover`,
      file,
      {},
      () => {},
      new AbortController().signal,
    )
    setCurrent(updated)
    saved(updated)
  }
  async function verify(file: File) {
    setVerification('')
    if (file.size !== game.size)
      throw new Error('Rozmiar wybranego pliku różni się od oryginału.')
    const hash = await hashFile(file, (p) =>
      setVerification(`Sprawdzanie SHA-256… ${p}%`),
    )
    if (hash !== game.checksum) {
      setVerification('')
      throw new Error(
        'Suma SHA-256 nie zgadza się. Plik jest inny lub uszkodzony.',
      )
    }
    setVerification('Suma SHA-256 zgodna. Plik jest kompletny.')
  }
  return (
    <Modal title="Szczegóły gry" close={close} wide>
      <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <div>
          <Cover game={current} base={base} large />
          {!shared && (
            <button
              disabled={busy}
              onClick={() => coverInput.current?.click()}
              className="btn-secondary mt-3 w-full !text-xs"
            >
              <ImagePlus size={16} />
              {current.has_cover ? 'Zmień okładkę' : 'Dodaj okładkę'}
            </button>
          )}
          <input
            className="hidden"
            type="file"
            accept="image/png,image/jpeg"
            ref={coverInput}
            aria-label="Wybierz okładkę"
            onChange={(e) => {
              if (e.target.files?.[0]) void run(() => cover(e.target.files![0]))
              e.target.value = ''
            }}
          />
        </div>
        <div className="min-w-0">
          {shared ? (
            <>
              <h3 className="text-2xl font-medium">{game.title}</h3>
              <p className="mt-2 text-muted">{game.platform}</p>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => update({ title, platform }))
              }}
              className="space-y-3"
            >
              <label className="label">
                Tytuł
                <input
                  className="field"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={200}
                />
              </label>
              <label className="label">
                Platforma
                <input
                  className="field"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  required
                  maxLength={80}
                />
              </label>
              <button
                className="btn-secondary !py-2 !text-xs"
                disabled={
                  busy ||
                  (title === current.title && platform === current.platform)
                }
              >
                Zapisz zmiany
              </button>
            </form>
          )}
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Rozmiar</dt>
              <dd className="mt-1">{bytes(game.size)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Format</dt>
              <dd className="mt-1 uppercase">{game.extension.slice(1)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted">Dodano</dt>
              <dd className="mt-1">{date(game.created_at)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted">Oryginalny plik</dt>
              <dd className="mt-1 break-all">{game.original_name}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="mt-6 rounded-2xl bg-[#141619] p-4">
        <div className="flex items-center gap-2 text-sm text-green-300">
          <ShieldCheck size={17} />
          <span>Integralność pliku · SHA-256</span>
        </div>
        <p className="mt-3 break-all font-mono text-[11px] leading-5 text-muted">
          {game.checksum}
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <button
            className="text-link !text-xs"
            disabled={busy}
            onClick={() =>
              void run(() =>
                downloadFile(`${base}/games/${game.id}/checksum`, shared),
              )
            }
          >
            Pobierz plik .sha256
          </button>
          <button
            className="text-link !text-xs"
            disabled={busy}
            onClick={() => verifyInput.current?.click()}
          >
            Sprawdź pobrany plik
          </button>
        </div>
        <input
          className="hidden"
          type="file"
          ref={verifyInput}
          aria-label="Wybierz pobrany plik do sprawdzenia"
          onChange={(e) => {
            if (e.target.files?.[0]) void run(() => verify(e.target.files![0]))
            e.target.value = ''
          }}
        />
        {verification && (
          <p
            className="mt-3 flex items-center gap-2 text-xs text-green-300"
            role="status"
          >
            {verification.includes('zgodna') && <CheckCircle2 size={15} />}
            {verification}
          </p>
        )}
      </div>
      {error && (
        <p className="error mt-4" role="alert">
          {error}
        </p>
      )}
      {confirmDelete && (
        <div className="mt-4 rounded-xl bg-red-400/10 p-4">
          <p className="text-sm">
            Usunąć „{game.title}” wraz z ROM-em i okładką?
          </p>
          <div className="mt-3 flex gap-3">
            <button
              disabled={busy}
              className="text-sm text-red-300"
              onClick={() =>
                void run(async () => {
                  await api(`/games/${game.id}`, { method: 'DELETE' })
                  saved()
                  close()
                })
              }
            >
              Tak, usuń grę
            </button>
            <button
              className="text-sm text-muted"
              onClick={() => setConfirmDelete(false)}
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {!shared && (
            <>
              <button
                className="icon-btn"
                disabled={busy}
                title="Usuń grę"
                aria-label="Usuń grę"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={19} />
              </button>
              <button
                className={`icon-btn ${current.favorite ? '!text-[#fdd663]' : ''}`}
                disabled={busy}
                title="Ulubiona gra"
                aria-label="Przełącz ulubioną"
                aria-pressed={current.favorite}
                onClick={() =>
                  void run(() => update({ favorite: !current.favorite }))
                }
              >
                <Star
                  size={19}
                  fill={current.favorite ? 'currentColor' : 'none'}
                />
              </button>
            </>
          )}
        </div>
        <button
          disabled={busy}
          className="btn-primary"
          onClick={() =>
            void run(() =>
              downloadFile(`${base}/games/${game.id}/download`, shared),
            )
          }
        >
          {busy ? (
            <LoaderCircle className="animate-spin" size={17} />
          ) : (
            <Download size={17} />
          )}
          Pobierz ROM
        </button>
      </div>
    </Modal>
  )
}
