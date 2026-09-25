import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCubeStore } from '../state/useCubeStore'
import { handbookPages, type HandbookPage } from './HandbookPages'

const snapEase = [0.2, 0.8, 0.2, 1] as const
const swipeDistance = 60
const swipeVelocity = 400
const focusableSelector = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function useHandbookShortcut(open: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      if (useCubeStore.getState().isCustomizeOpen) return
      event.preventDefault()
      open()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])
}

function PageFrame({ page }: { page: HandbookPage }) {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[min(100%,calc((100dvh-19rem)*4/3))] max-sm:aspect-square max-sm:max-w-[min(100%,calc(100dvh-20rem))] landscape-phone:mx-0 landscape-phone:h-[calc(100dvh-9rem)] landscape-phone:w-auto landscape-phone:max-w-none landscape-phone:shrink-0 overflow-hidden rounded-2xl border border-line bg-ground">
      {page.photo ? (
        <img
          src={page.photo}
          alt={page.photoAlt ?? ''}
          width={1200}
          height={900}
          draggable={false}
          decoding="async"
          className="size-full select-none object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center">{page.visual}</div>
      )}
    </div>
  )
}

function PageBody({ page }: { page: HandbookPage }) {
  return (
    <div className="flex flex-col gap-5 landscape-phone:flex-row landscape-phone:items-center landscape-phone:gap-6">
      <PageFrame page={page} />
      <div className="flex min-h-[8.5rem] flex-col gap-3 px-1 landscape-phone:min-h-0 landscape-phone:flex-1">
        <div className="flex flex-col gap-1">
          <h3 className="text-[22px] font-medium leading-tight tracking-[-0.02em]">{page.title}</h3>
          <p className="text-[14px] text-muted">
            {page.touchCaption ? (
              <>
                <span className="pointer-coarse:hidden">{page.caption}</span>
                <span className="hidden pointer-coarse:inline">{page.touchCaption}</span>
              </>
            ) : (
              page.caption
            )}
          </p>
        </div>
        {page.detail}
      </div>
    </div>
  )
}

function PagerButton({ label, onClick, isDisabled, children }: { label: string; onClick: () => void; isDisabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={isDisabled}
      className="flex size-11 items-center justify-center rounded-full border border-line text-ink transition-[background-color,border-color,opacity] duration-150 hover:border-line-strong hover:bg-ink/[0.04] disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function usePreloadedPhotos() {
  useEffect(() => {
    for (const page of handbookPages) {
      if (!page.photo) continue
      const image = new Image()
      image.src = page.photo
      image.decode().catch(() => {})
    }
  }, [])
}

function HandbookBody({ onClose }: { onClose: () => void }) {
  usePreloadedPhotos()
  const [pageIndex, setPageIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const dialogRef = useRef<HTMLDivElement>(null)
  const lastIndex = handbookPages.length - 1
  const page = handbookPages[pageIndex]

  const goTo = (targetIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(lastIndex, targetIndex))
    if (clampedIndex === pageIndex) return
    setDirection(clampedIndex > pageIndex ? 1 : -1)
    setPageIndex(clampedIndex)
  }

  const goToRef = useRef(goTo)
  goToRef.current = goTo
  const pageIndexRef = useRef(pageIndex)
  pageIndexRef.current = pageIndex

  useEffect(() => {
    const trapFocus = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const isInside = dialog.contains(document.activeElement)
      if (event.shiftKey && (document.activeElement === first || !isInside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !isInside)) {
        event.preventDefault()
        first.focus()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToRef.current(pageIndexRef.current + 1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToRef.current(pageIndexRef.current - 1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        goToRef.current(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        goToRef.current(lastIndex)
      } else if (event.key === 'Tab') {
        trapFocus(event)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose, lastIndex])

  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.x < -swipeDistance || info.velocity.x < -swipeVelocity) goTo(pageIndex + 1)
    else if (info.offset.x > swipeDistance || info.velocity.x > swipeVelocity) goTo(pageIndex - 1)
  }

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="handbook-title"
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.99, transition: { duration: 0.16 } }}
      transition={{ duration: 0.28, ease: snapEase }}
      className="relative flex h-full w-full flex-col bg-ground px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:w-[min(600px,calc(100vw-3rem))] sm:rounded-3xl sm:border sm:border-line sm:bg-raised sm:px-6 sm:pt-4 sm:pb-6 landscape-phone:h-full! landscape-phone:max-h-none! landscape-phone:w-full! landscape-phone:rounded-none! landscape-phone:border-0! landscape-phone:bg-ground! landscape-phone:pt-[max(0.25rem,env(safe-area-inset-top))]! landscape-phone:pb-[max(0.5rem,env(safe-area-inset-bottom))]!"
    >
      <header className="flex shrink-0 items-center justify-between pl-1">
        <h2 id="handbook-title" className="label">
          Handbook
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] max-sm:text-[12px] tabular-nums text-faint" aria-hidden>
            {pageIndex + 1}/{handbookPages.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close handbook"
            autoFocus
            className="-mr-1.5 flex size-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/[0.05]"
          >
            <X size={16} strokeWidth={1.7} />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col justify-center overflow-hidden pt-2 pb-5 sm:flex-none landscape-phone:flex-1! landscape-phone:pb-2!">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.section
            key={page.id}
            custom={direction}
            aria-roledescription="slide"
            aria-label={`${pageIndex + 1} of ${handbookPages.length}: ${page.title}`}
            variants={{
              enter: (enterDirection: number) => ({ opacity: 0, x: enterDirection * 40 }),
              center: { opacity: 1, x: 0 },
              exit: (exitDirection: number) => ({ opacity: 0, x: exitDirection * -40 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.26, ease: snapEase }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            dragSnapToOrigin
            onDragEnd={handleDragEnd}
            className="touch-pan-y select-none"
          >
            <PageBody page={page} />
          </motion.section>
        </AnimatePresence>
      </div>

      <footer className="flex shrink-0 items-center justify-between">
        <PagerButton label="Previous" onClick={() => goTo(pageIndex - 1)} isDisabled={pageIndex === 0}>
          <ArrowLeft size={16} strokeWidth={1.7} />
        </PagerButton>
        <div className="flex items-center" role="group" aria-label="Pages">
          {handbookPages.map((dotPage, dotIndex) => {
            const isCurrent = dotIndex === pageIndex
            return (
              <button
                key={dotPage.id}
                type="button"
                aria-label={dotPage.title}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => goTo(dotIndex)}
                className="flex h-11 w-6 items-center justify-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-[width,background-color] duration-300 ${isCurrent ? 'w-4 bg-accent' : 'w-1.5 bg-line-strong'}`}
                />
              </button>
            )
          })}
        </div>
        <PagerButton label="Next" onClick={() => goTo(pageIndex + 1)} isDisabled={pageIndex === lastIndex}>
          <ArrowRight size={16} strokeWidth={1.7} />
        </PagerButton>
      </footer>
    </motion.div>
  )
}

export function Handbook({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const openerRef = useRef<HTMLElement | null>(null)
  const [wasOpen, setWasOpen] = useState(isOpen)

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen && document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement
  }

  const restoreFocus = () => {
    openerRef.current?.focus()
    openerRef.current = null
  }

  return (
    <AnimatePresence onExitComplete={restoreFocus}>
      {isOpen && (
        <motion.div
          key="handbook"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ground sm:bg-black/60"
          onClick={(event) => event.target === event.currentTarget && onClose()}
        >
          <HandbookBody onClose={onClose} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
