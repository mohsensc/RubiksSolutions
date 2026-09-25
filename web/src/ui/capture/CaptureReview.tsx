import { motion } from 'framer-motion'
import { Check, Paintbrush, RotateCcw } from 'lucide-react'
import { faceColors, faceOffset, faceOrder, type Face, type FaceletChar } from '../../cube/facelets'

const reviewNetPlacement: Record<Face, { column: number; row: number }> = {
  U: { column: 2, row: 1 },
  L: { column: 1, row: 2 },
  F: { column: 2, row: 2 },
  R: { column: 3, row: 2 },
  B: { column: 4, row: 2 },
  D: { column: 2, row: 3 },
}

interface CaptureReviewProps {
  facelets: string
  onUse: () => void
  onEdit: () => void
  onRetake: () => void
}

export function CaptureReview({ facelets, onUse, onEdit, onRetake }: CaptureReviewProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 px-5 pt-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, rotateX: 24 }}
        animate={{ opacity: 1, scale: 1, rotateX: 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        className="grid gap-[5px] [perspective:900px]"
        style={{ gridTemplateColumns: 'repeat(4, auto)', gridTemplateRows: 'repeat(3, auto)' }}
        role="img"
        aria-label="Detected cube"
      >
        {faceOrder.map((face, faceIndex) => (
          <motion.div
            key={face}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 + faceIndex * 0.05 }}
            className="grid grid-cols-3 gap-[2px] rounded-[7px] border border-line p-[2px]"
            style={{ gridColumn: reviewNetPlacement[face].column, gridRow: reviewNetPlacement[face].row }}
          >
            {Array.from({ length: 9 }, (_, position) => {
              const char = facelets[faceOffset[face] + position] as FaceletChar
              return (
                <span
                  key={position}
                  className="block size-[clamp(14px,5.4vw,22px)] rounded-[3px]"
                  style={{ backgroundColor: char === '?' ? 'rgb(236 235 230 / 0.1)' : faceColors[char] }}
                />
              )
            })}
          </motion.div>
        ))}
      </motion.div>

      <div className="flex w-full max-w-sm items-center gap-2">
        <button
          type="button"
          onClick={onRetake}
          aria-label="Retake"
          data-tip="Retake"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-ink transition-[background-color,border-color,transform] duration-150 hover:border-line-strong hover:bg-ink/[0.04] active:scale-[0.97]"
        >
          <RotateCcw size={16} strokeWidth={1.6} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line text-ink transition-[background-color,border-color,transform] duration-150 hover:border-line-strong hover:bg-ink/[0.04] active:scale-[0.97]"
        >
          <Paintbrush size={14} strokeWidth={1.7} aria-hidden />
          <span className="text-[13px] font-medium">Edit</span>
        </button>
        <button
          type="button"
          onClick={onUse}
          autoFocus
          className="flex h-11 flex-[1.6] items-center justify-center gap-2 rounded-full bg-ink text-ground transition-[background-color,transform] duration-150 hover:bg-ink/90 active:scale-[0.97]"
        >
          <Check size={15} strokeWidth={2.2} aria-hidden />
          <span className="text-[13px] font-medium">Use this cube</span>
        </button>
      </div>
    </div>
  )
}
