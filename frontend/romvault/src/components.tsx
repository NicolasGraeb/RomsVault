import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X, Gamepad2, Layers3 } from 'lucide-react'
import type { Game } from './types'

export function Brand() {
  return (
    <span className="flex items-center gap-2.5 text-[23px] tracking-[-1px]">
      <span className="brand-icon">
        <Layers3 size={23} strokeWidth={2.2} />
      </span>
      <span className="font-semibold text-[#e3e3e3]">
        Rom<span className="font-normal text-[#b6b8bd]">Vault</span>
      </span>
    </span>
  )
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string
  children: ReactNode
  close: () => void
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleID = useId()
  useEffect(() => {
    ref.current?.showModal()
    const dialog = ref.current
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleID}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect()
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            close()
        }
      }}
    >
      <div className="flex items-center justify-between gap-4 px-6 py-5">
        <h2 id={titleID} className="text-xl font-medium">
          {title}
        </h2>
        <button className="icon-btn" onClick={close} aria-label="Zamknij">
          <X size={21} />
        </button>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </dialog>
  )
}
const palettes = [
  'from-[#263b56] via-[#1e2b40] to-[#172131]',
  'from-[#4d344a] via-[#362438] to-[#211d2c]',
  'from-[#355149] via-[#273931] to-[#1b2b25]',
  'from-[#57503b] via-[#3b3529] to-[#2a251e]',
  'from-[#424064] via-[#302e4c] to-[#222138]',
  'from-[#583939] via-[#3d292d] to-[#281e25]',
]
export function Cover({
  game,
  base,
  large = false,
}: {
  game: Game
  base: string
  large?: boolean
}) {
  const index =
    Array.from(game.platform).reduce((sum, c) => sum + c.charCodeAt(0), 0) %
    palettes.length
  return (
    <div
      className={`cover bg-gradient-to-br ${palettes[index]} ${large ? 'cover-large' : ''}`}
    >
      {game.has_cover ? (
        <img
          src={`${base}/games/${game.id}/cover?v=${encodeURIComponent(game.cover_version)}`}
          alt={`Okładka ${game.title}`}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <>
          <div className="cover-orbit" />
          <div className="cover-orbit second" />
          <span className="absolute left-4 top-4 text-[10px] font-semibold uppercase tracking-[.16em] text-white/55">
            {game.platform}
          </span>
          <Gamepad2
            className="absolute right-4 top-4 text-white/25"
            size={19}
          />
          <div className="absolute bottom-7 left-5 right-5">
            <span className="mb-2 block text-[9px] uppercase tracking-[.25em] text-white/40">
              Twoja kolekcja
            </span>
            <span className="line-clamp-4 block text-[27px] font-semibold leading-[1.08] tracking-tight text-white/90">
              {game.title}
            </span>
            <div className="mt-4 h-0.5 w-9 bg-white/35" />
          </div>
        </>
      )}
    </div>
  )
}
