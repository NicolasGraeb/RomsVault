import { useEffect, useRef, useState } from 'react'
import {
  Check,
  FileArchive,
  LoaderCircle,
  Plus,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react'
import { bytes, hashFile, message, uploadFile } from './api'
import { Modal } from './components'
import type { Extension, Game } from './types'

type Item = {
  id: string
  file: File
  title: string
  platform: string
  checksum?: string
  status: 'ready' | 'hashing' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}
function uniqueID() {
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (
      Number(c) ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
    ).toString(16),
  )
}
export function UploadDialog({
  extensions,
  maxBytes,
  close,
  saved,
}: {
  extensions: Extension[]
  maxBytes: number
  close: () => void
  saved: () => void
}) {
  const [items, setItems] = useState<Item[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const active = extensions.filter((e) => e.enabled)
  useEffect(() => () => controller.current?.abort(), [])
  const patch = (id: string, change: Partial<Item>) =>
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...change } : item)),
    )
  function add(files: FileList | File[]) {
    const next: Item[] = []
    const errors: string[] = []
    for (const file of Array.from(files)) {
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
      const format = active.find((e) => e.extension === ext)
      if (!format) {
        errors.push(`${file.name}: nieobsługiwany format`)
        continue
      }
      if (!file.size || file.size > maxBytes) {
        errors.push(
          `${file.name}: plik pusty lub większy niż ${bytes(maxBytes)}`,
        )
        continue
      }
      next.push({
        id: uniqueID(),
        file,
        title: file.name.slice(0, -ext.length),
        platform: format.platform,
        status: 'ready',
        progress: 0,
      })
    }
    setItems((prev) => [...prev, ...next])
    setError(errors.join(' · '))
    if (input.current) input.current.value = ''
  }
  async function start() {
    setRunning(true)
    setError('')
    controller.current = new AbortController()
    for (const item of items.filter((i) => i.status !== 'done')) {
      if (controller.current.signal.aborted) break
      try {
        patch(item.id, { status: 'hashing', progress: 0, error: undefined })
        const checksum =
          item.checksum ??
          (await hashFile(
            item.file,
            (p) => patch(item.id, { progress: p }),
            controller.current.signal,
          ))
        patch(item.id, { status: 'uploading', checksum, progress: 0 })
        await uploadFile<Game>(
          '/games',
          item.file,
          {
            'Idempotency-Key': item.id,
            'X-Filename': encodeURIComponent(item.file.name),
            'X-Title': encodeURIComponent(item.title),
            'X-Platform': encodeURIComponent(item.platform),
            'X-Checksum-SHA256': checksum,
          },
          (p) => patch(item.id, { progress: p }),
          controller.current.signal,
        )
        patch(item.id, { status: 'done', progress: 100 })
        saved()
      } catch (e) {
        patch(item.id, { status: 'error', error: message(e) })
      }
    }
    setRunning(false)
  }
  const done = items.filter((i) => i.status === 'done').length
  return (
    <Modal title="Dodaj gry do biblioteki" close={close} wide>
      <p className="mb-5 text-sm text-muted">
        Prześlij swoje ROM-y. Każdy plik zostanie sprawdzony sumą SHA-256.
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept={active.map((e) => e.extension).join(',')}
        className="hidden"
        onChange={(e) => e.target.files && add(e.target.files)}
        disabled={running}
        aria-label="Wybierz pliki ROM"
      />
      <button
        disabled={running}
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!running) add(e.dataTransfer.files)
        }}
      >
        <span className="mb-4 rounded-2xl bg-[#a8c7fa]/10 p-4 text-accent">
          <Upload size={28} />
        </span>
        <span className="font-medium">Przeciągnij pliki tutaj</span>
        <span className="mt-1 text-sm text-muted">
          lub wybierz z urządzenia · do {bytes(maxBytes)} na plik
        </span>
      </button>
      <details className="my-3 text-xs text-muted">
        <summary className="cursor-pointer">
          Obsługiwane formaty ({active.length})
        </summary>
        <p className="mt-2 leading-6">
          {active.map((e) => e.extension).join(' · ')}
        </p>
        <p className="mt-1">
          Zestawy BIN/CUE dodawaj razem; struktury folderów najlepiej spakować
          do ZIP lub 7z.
        </p>
      </details>
      {error && (
        <p className="error my-3" role="alert">
          {error}
        </p>
      )}
      <div className="max-h-[38vh] space-y-3 overflow-auto">
        {items.map((item) => (
          <div className="rounded-xl border border-white/10 p-3" key={item.id}>
            <div className="flex items-center gap-3">
              <FileArchive size={20} className="shrink-0 text-muted" />
              <p
                className="min-w-0 flex-1 truncate text-sm"
                title={item.file.name}
              >
                {item.file.name}
                <span className="ml-2 text-xs text-muted">
                  {bytes(item.file.size)}
                </span>
              </p>
              {item.status === 'done' ? (
                <Check size={19} className="text-green-300" />
              ) : (
                !running && (
                  <button
                    className="icon-btn !size-7"
                    aria-label={`Usuń ${item.file.name} z kolejki`}
                    onClick={() =>
                      setItems((prev) => prev.filter((i) => i.id !== item.id))
                    }
                  >
                    <X size={16} />
                  </button>
                )
              )}
            </div>
            {item.status !== 'done' && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  className="field !py-2 !text-sm"
                  aria-label={`Tytuł ${item.file.name}`}
                  value={item.title}
                  maxLength={200}
                  disabled={running}
                  onChange={(e) => patch(item.id, { title: e.target.value })}
                />
                <input
                  className="field !py-2 !text-sm"
                  aria-label={`Platforma ${item.file.name}`}
                  value={item.platform}
                  maxLength={80}
                  disabled={running}
                  onChange={(e) => patch(item.id, { platform: e.target.value })}
                />
              </div>
            )}
            {(item.status === 'hashing' || item.status === 'uploading') && (
              <>
                <p className="mb-2 mt-3 text-xs text-accent">
                  {item.status === 'hashing'
                    ? 'Obliczanie SHA-256'
                    : item.progress === 100
                      ? 'Zapisywanie i weryfikacja na serwerze'
                      : 'Przesyłanie'}{' '}
                  · {item.progress}%
                </p>
                <progress
                  className="progress"
                  max="100"
                  value={item.progress}
                />
              </>
            )}
            {item.error && (
              <p className="mt-2 text-xs text-red-300" role="alert">
                {item.error}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {done
            ? `${done} z ${items.length} przesłanych`
            : 'Pliki pozostają prywatne'}
        </p>
        <div className="flex gap-2">
          {running ? (
            <button
              className="btn-secondary"
              onClick={() => controller.current?.abort()}
            >
              Anuluj
            </button>
          ) : (
            <button className="btn-secondary" onClick={close}>
              {done === items.length && done > 0 ? 'Gotowe' : 'Zamknij'}
            </button>
          )}
          <button
            className="btn-primary"
            disabled={
              running ||
              !items.some((i) => i.status !== 'done') ||
              items.some((i) => !i.title.trim() || !i.platform.trim())
            }
            onClick={start}
          >
            {running ? (
              <LoaderCircle size={17} className="animate-spin" />
            ) : items.some((i) => i.status === 'error') ? (
              <RotateCcw size={17} />
            ) : (
              <Plus size={17} />
            )}
            {running
              ? 'Przesyłanie…'
              : items.some((i) => i.status === 'error')
                ? 'Ponów pozostałe'
                : 'Prześlij gry'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
