import { createSHA256 } from 'hash-wasm'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
let refreshing: Promise<void> | undefined
export function refreshSession() {
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
  })
    .then(async (r) => {
      if (!r.ok)
        throw new ApiError(
          (await r.json().catch(() => ({}))).error ??
            'Nie udało się odnowić sesji.',
          r.status,
        )
    })
    .finally(() => {
      refreshing = undefined
    })
  return refreshing
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const r = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(typeof init.body === 'string'
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init.headers,
    },
  })
  if (
    r.status === 401 &&
    retry &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/register') &&
    !path.startsWith('/shared/')
  ) {
    try {
      await refreshSession()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        window.dispatchEvent(new Event('session-expired'))
      throw e
    }
    return api<T>(path, init, false)
  }
  if (!r.ok)
    throw new ApiError(
      (await r.json().catch(() => ({}))).error ?? `Błąd serwera (${r.status}).`,
      r.status,
    )
  return r.status === 204 ? (undefined as T) : r.json()
}
export function message(e: unknown) {
  return e instanceof Error ? e.message : 'Wystąpił nieoczekiwany błąd.'
}
export function bytes(n: number) {
  if (n < 1024) return `${n} B`
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4)
  return `${(n / 1024 ** i).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`
}
export function date(value: string) {
  return new Date(value).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
export async function hashFile(
  file: File,
  progress?: (n: number) => void,
  signal?: AbortSignal,
) {
  const hash = await createSHA256()
  hash.init()
  const chunk = 4 * 1024 * 1024
  for (let offset = 0; offset < file.size; offset += chunk) {
    signal?.throwIfAborted()
    hash.update(
      new Uint8Array(await file.slice(offset, offset + chunk).arrayBuffer()),
    )
    progress?.(Math.min(100, Math.round(((offset + chunk) / file.size) * 100)))
  }
  return hash.digest('hex')
}
export async function uploadFile<T>(
  path: string,
  file: File,
  headers: Record<string, string>,
  progress: (n: number) => void,
  signal: AbortSignal,
): Promise<T> {
  // Renew before a potentially long transfer so an expired access token cannot waste it.
  await refreshSession()
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Przesyłanie anulowane.'))
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open(path.endsWith('/cover') ? 'PUT' : 'POST', `/api${path}`)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.setRequestHeader(
      'Content-Type',
      file.type || 'application/octet-stream',
    )
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100))
    }
    const abort = () => xhr.abort()
    signal.addEventListener('abort', abort, { once: true })
    xhr.onloadend = () => signal.removeEventListener('abort', abort)
    xhr.onload = () => {
      let response: T & { error?: string }
      try {
        response = JSON.parse(xhr.responseText)
      } catch {
        reject(new Error(`Nieprawidłowa odpowiedź serwera (${xhr.status}).`))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(response)
      else
        reject(
          new ApiError(
            response.error ?? 'Nie udało się przesłać pliku.',
            xhr.status,
          ),
        )
    }
    xhr.onerror = () =>
      reject(
        new Error('Połączenie przerwane. Możesz bezpiecznie ponowić upload.'),
      )
    xhr.onabort = () => reject(new Error('Przesyłanie anulowane.'))
    xhr.timeout = 110 * 60 * 1000
    xhr.ontimeout = () =>
      reject(new Error('Upłynął czas przesyłania. Spróbuj ponownie.'))
    xhr.send(file)
  })
}
