import { AnimatePresence, motion, type TargetAndTransition } from 'framer-motion'
import { Box, Check, CircleAlert, Eraser, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  centerIndices,
  countColors,
  faceColorNames,
  faceColors,
  faceOffset,
  faceOrder,
  isFace,
  solvedFacelets,
  type Face,
  type FaceletChar,
} from '../cube/facelets'
import { faceletsOfCubie } from '../cube/geometry'
import { engine, EngineError } from '../engine/engineClient'
import { selectProjectedFacelets, useCubeStore } from '../state/useCubeStore'

const netPlacement: Record<Face, { column: number; row: number }> = {
  U: { column: 2, row: 1 },
  L: { column: 1, row: 2 },
  F: { column: 2, row: 2 },
  R: { column: 3, row: 2 },
  B: { column: 4, row: 2 },
  D: { column: 2, row: 3 },
}

const foldedPose: Record<Face, { initial: TargetAndTransition; origin: string; delay: number }> = {
  F: { initial: { scale: 0.7, opacity: 0 }, origin: '50% 50%', delay: 0.05 },
  U: { initial: { rotateX: -90, opacity: 0 }, origin: '50% 100%', delay: 0.18 },
  D: { initial: { rotateX: 90, opacity: 0 }, origin: '50% 0%', delay: 0.22 },
  L: { initial: { rotateY: 90, opacity: 0 }, origin: '100% 50%', delay: 0.2 },
  R: { initial: { rotateY: -90, opacity: 0 }, origin: '0% 50%', delay: 0.24 },
  B: { initial: { rotateY: -180, opacity: 0 }, origin: '0% 50%', delay: 0.4 },
}

const unfoldEase = [0.2, 0.8, 0.2, 1] as const

function clearedFacelets(): string {
  return Array.from(solvedFacelets, (char, index) => (centerIndices.includes(index) ? char : '?')).join('')
}

interface Problem {
  tone: 'progress' | 'error'
  text: string
  faceletIndices: number[]
}

const pieceAxisByLetter: Record<Face, { axis: 0 | 1 | 2; layer: 1 | -1 }> = {
  U: { axis: 1, layer: 1 },
  D: { axis: 1, layer: -1 },
  R: { axis: 0, layer: 1 },
  L: { axis: 0, layer: -1 },
  F: { axis: 2, layer: 1 },
  B: { axis: 2, layer: -1 },
}

function faceletsOfPiece(pieceName: string): number[] {
  const cubie: [number, number, number] = [0, 0, 0]
  for (const letter of pieceName) {
    if (!isFace(letter)) return []
    cubie[pieceAxisByLetter[letter].axis] = pieceAxisByLetter[letter].layer
  }
  return faceletsOfCubie(cubie)
}

const engineErrorPhrases: Array<[RegExp, string]> = [
  [/center colors/i, 'Centers can’t sit like this'],
  [/duplicate corner/i, 'Two corners are the same piece'],
  [/duplicate edge/i, 'Two edges are the same piece'],
  [/twisted corner/i, 'One corner is twisted'],
  [/flipped edge/i, 'One edge is flipped'],
  [/parity/i, 'Two pieces are swapped'],
]

function describeEngineError(message: string): Problem {
  const invalidPiece = message.match(/invalid (corner|edge) at ([URFDLB]{2,3})/i)
  if (invalidPiece) {
    return { tone: 'error', text: `This ${invalidPiece[1].toLowerCase()} can’t exist`, faceletIndices: faceletsOfPiece(invalidPiece[2]) }
  }
  const phrase = engineErrorPhrases.find(([pattern]) => pattern.test(message))
  return { tone: 'error', text: phrase ? phrase[1] : message, faceletIndices: [] }
}

function localProblem(facelets: string): Problem | null {
  const counts = countColors(facelets)
  if (counts['?'] > 0) return { tone: 'progress', text: `${counts['?']} left`, faceletIndices: [] }
  const unbalancedFace = faceOrder.find((face) => counts[face] !== 9)
  if (unbalancedFace) {
    return { tone: 'error', text: `${faceColorNames[unbalancedFace]} has ${counts[unbalancedFace]} of 9`, faceletIndices: [] }
  }
  return null
}

type EngineVerdict = { facelets: string; error: string | null } | null

function useEngineVerdict(facelets: string, isEnabled: boolean): EngineVerdict {
  const [verdict, setVerdict] = useState<EngineVerdict>(null)
  useEffect(() => {
    if (!isEnabled) return
    let isCurrent = true
    const timer = window.setTimeout(() => {
      engine
        .validate(facelets)
        .then(() => isCurrent && setVerdict({ facelets, error: null }))
        .catch((error: EngineError) => isCurrent && !error.unavailable && setVerdict({ facelets, error: error.message }))
    }, 120)
    return () => {
      isCurrent = false
      window.clearTimeout(timer)
    }
  }, [facelets, isEnabled])
  return verdict?.facelets === facelets ? verdict : null
}

function StickerNet({
  draft,
  flaggedFacelets,
  onPaint,
}: {
  draft: string
  flaggedFacelets: ReadonlySet<number>
  onPaint: (index: number) => void
}) {
  const isPaintingRef = useRef(false)

  const faceletFromPoint = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-facelet]')
    return element ? Number(element.dataset.facelet) : null
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const index = faceletFromPoint(event.clientX, event.clientY)
    if (index === null) return
    isPaintingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    onPaint(index)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isPaintingRef.current) return
    const index = faceletFromPoint(event.clientX, event.clientY)
    if (index !== null) onPaint(index)
  }

  const stopPainting = () => {
    isPaintingRef.current = false
  }

  return (
    <motion.div
      initial={{ rotateX: 28, rotateY: -32, scale: 0.8 }}
      animate={{ rotateX: 0, rotateY: 0, scale: 1 }}
      transition={{ duration: 0.8, ease: unfoldEase }}
      className="grid touch-none select-none gap-[calc(var(--sticker)*0.18)] [--sticker:clamp(20px,min(6vw,5.2vh),52px)] [transform-style:preserve-3d]"
      style={{ gridTemplateColumns: 'repeat(4, auto)', gridTemplateRows: 'repeat(3, auto)' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPainting}
      onPointerCancel={stopPainting}
    >
      {faceOrder.map((face) => (
        <motion.div
          key={face}
          initial={foldedPose[face].initial}
          animate={{ rotateX: 0, rotateY: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: foldedPose[face].delay, ease: unfoldEase }}
          style={{
            gridColumn: netPlacement[face].column,
            gridRow: netPlacement[face].row,
            transformOrigin: foldedPose[face].origin,
          }}
          className="grid grid-cols-3 gap-[3px] rounded-[10px] border border-line p-[3px]"
        >
          {Array.from({ length: 9 }, (_, position) => {
            const index = faceOffset[face] + position
            const char = draft[index] as FaceletChar
            const isCenter = position === 4
            const colorLabel = char === '?' ? 'empty' : faceColorNames[char]
            const isFlagged = flaggedFacelets.has(index)
            return (
              <button
                key={index}
                type="button"
                data-facelet={isCenter ? undefined : index}
                disabled={isCenter}
                onClick={() => onPaint(index)}
                aria-label={isCenter ? `${faceColorNames[face]} center, fixed` : `Sticker ${face}${position + 1}, ${colorLabel}`}
                className={`flex size-(--sticker) items-center justify-center rounded-[6px] outline-offset-2 transition-[background-color,transform] duration-150 enabled:hover:scale-[0.92] disabled:cursor-default ${
                  isFlagged ? 'outline-2 outline-danger outline-solid' : ''
                }`}
                style={
                  char === '?'
                    ? { boxShadow: 'inset 0 0 0 1px rgb(236 235 230 / 0.14)' }
                    : { backgroundColor: faceColors[char] }
                }
              >
                {isCenter && <span className="font-mono text-[9px] font-medium text-black/45">{face}</span>}
              </button>
            )
          })}
        </motion.div>
      ))}
    </motion.div>
  )
}

function SheetAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Eraser
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-full border border-line px-4 text-ink transition-[background-color,border-color,transform] duration-150 hover:border-line-strong hover:bg-ink/[0.04] active:scale-[0.97]"
    >
      <Icon size={14} strokeWidth={1.7} aria-hidden />
      <span className="text-[13px] font-medium">{label}</span>
    </button>
  )
}

function CustomizeBody({ onClose }: { onClose: () => void }) {
  const initialFacelets = useMemo(() => selectProjectedFacelets(useCubeStore.getState()), [])
  const [draft, setDraft] = useState(initialFacelets)
  const [brush, setBrush] = useState<Face>('U')
  const engineStatus = useCubeStore((state) => state.engineStatus)
  const applyCustomFacelets = useCubeStore((state) => state.applyCustomFacelets)
  const counts = countColors(draft)
  const localIssue = localProblem(draft)
  const isEngineReady = engineStatus === 'ready'
  const verdict = useEngineVerdict(draft, localIssue === null && isEngineReady)
  const problem = localIssue ?? (verdict?.error ? describeEngineError(verdict.error) : null)
  const flaggedFacelets = new Set(problem?.faceletIndices)
  const isChecking = localIssue === null && isEngineReady && verdict === null
  const canApply = localIssue === null && (!isEngineReady || verdict?.error === null)

  const paint = (index: number) => {
    if (centerIndices.includes(index)) return
    setDraft((current) => (current[index] === brush ? current : current.slice(0, index) + brush + current.slice(index + 1)))
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      const paletteIndex = Number(event.key) - 1
      if (paletteIndex >= 0 && paletteIndex < faceOrder.length) setBrush(faceOrder[paletteIndex])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-4 py-16 [perspective:1100px]">
      <StickerNet draft={draft} flaggedFacelets={flaggedFacelets} onPaint={paint} />

      <div role="radiogroup" aria-label="Paint color" className="flex gap-2.5">
        {faceOrder.map((face, paletteIndex) => {
          const isSelected = brush === face
          const isFull = counts[face] === 9
          return (
            <button
              key={face}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${faceColorNames[face]}, ${counts[face]} of 9`}
              data-tip={`${faceColorNames[face]} · ${paletteIndex + 1}`}
              onClick={() => setBrush(face)}
              className="flex flex-col items-center gap-1.5"
            >
              <motion.span
                animate={{ scale: isSelected ? 1 : 0.82 }}
                transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                className={`block size-9 rounded-full outline-offset-[3px] ${isSelected ? 'outline-[1.5px] outline-ink outline-solid' : ''}`}
                style={{ backgroundColor: faceColors[face] }}
              />
              <span className={`font-mono text-[10px] tabular-nums ${isFull ? 'text-muted' : counts[face] > 9 ? 'text-danger' : 'text-faint'}`}>
                {counts[face]}/9
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex h-5 items-center justify-center gap-2 font-mono text-[12px]" aria-live="polite">
        {problem ? (
          <>
            {problem.tone === 'error' && <CircleAlert size={13} strokeWidth={1.8} className="text-danger" />}
            <span className={problem.tone === 'error' ? 'text-danger' : 'text-muted'}>{problem.text}</span>
          </>
        ) : isChecking ? (
          <span className="text-muted">checking</span>
        ) : (
          <>
            <Check size={13} strokeWidth={2} className="text-accent" />
            <span className="text-muted">{isEngineReady ? 'Valid cube' : 'Colors balanced'}</span>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <SheetAction icon={Eraser} label="Clear" onClick={() => setDraft(clearedFacelets())} />
        <SheetAction icon={Box} label="Use current" onClick={() => setDraft(initialFacelets)} />
        <SheetAction icon={RotateCcw} label="Solved" onClick={() => setDraft(solvedFacelets)} />
        <button
          type="button"
          disabled={!canApply}
          onClick={() => applyCustomFacelets(draft)}
          className="flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-accent-ink transition-[transform,background-color] duration-150 hover:bg-accent/90 active:scale-[0.97] disabled:bg-ink/[0.06] disabled:text-faint"
        >
          <Check size={14} strokeWidth={2.2} aria-hidden />
          <span className="text-[13px] font-medium">Apply</span>
        </button>
      </div>
    </div>
  )
}

export function CustomizeSheet() {
  const isOpen = useCubeStore((state) => state.isCustomizeOpen)
  const setCustomizeOpen = useCubeStore((state) => state.setCustomizeOpen)
  const close = useMemo(() => () => setCustomizeOpen(false), [setCustomizeOpen])
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
          key="customize-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Paint cube"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-40 overflow-y-auto bg-ground"
        >
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
            <span className="label">Paint</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              autoFocus
              className="flex size-9 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-line-strong hover:bg-ink/[0.04]"
            >
              <X size={15} strokeWidth={1.7} />
            </button>
          </div>
          <CustomizeBody onClose={close} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
