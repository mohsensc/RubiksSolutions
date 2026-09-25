import { AnimatePresence, motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Rotate3d } from 'lucide-react'
import type { ReactNode } from 'react'
import { cubeGreen } from './capturedShot'
import { ShotThumbnail } from './ShotThumbnail'

export function RoundIconButton({
  icon: Icon,
  label,
  onClick,
  isDisabled = false,
  className = '',
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  isDisabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      data-tip={label}
      className={`flex size-11 items-center justify-center rounded-full border border-line bg-ground/60 text-ink backdrop-blur-md transition-[background-color,border-color,transform] duration-150 hover:border-line-strong hover:bg-ink/[0.06] active:scale-[0.95] disabled:opacity-35 ${className}`}
    >
      <Icon size={17} strokeWidth={1.6} aria-hidden />
    </button>
  )
}

export function StatusPill({ isVisible, children }: { isVisible: boolean; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="flex h-8 items-center justify-center">
      <AnimatePresence>
        {isVisible && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className="flex items-center rounded-full border border-line bg-ground/70 px-3 py-1.5 font-mono text-[12px] text-ink backdrop-blur-md"
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FlipPillLabel() {
  return (
    <span className="flex items-center gap-2">
      <Rotate3d size={15} strokeWidth={1.7} aria-hidden />
      Flip the cube
    </span>
  )
}

export function StepLabel({ stepIndex }: { stepIndex: number }) {
  return (
    <span className="label tabular-nums" aria-label={`Photo ${stepIndex + 1} of 2`}>
      {stepIndex + 1}/2
    </span>
  )
}

export function FlipHint({ size = 44 }: { size?: number }) {
  return (
    <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <ShotThumbnail size={size} />
      <motion.span
        className="absolute inset-0 flex items-center justify-center text-ink"
        animate={{ rotate: [0, 180, 180] }}
        transition={{ duration: 2.4, times: [0, 0.45, 1], repeat: Infinity, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <Rotate3d size={size * 0.42} strokeWidth={1.6} aria-hidden />
      </motion.span>
    </span>
  )
}

export function ShotSlot({ colors, isAccepted }: { colors?: Parameters<typeof ShotThumbnail>[0]['colors']; isAccepted: boolean }) {
  return (
    <span
      className="flex size-11 items-center justify-center rounded-xl border bg-ground/60 backdrop-blur-md"
      style={{ borderColor: isAccepted ? cubeGreen : 'rgb(236 235 230 / 0.08)' }}
    >
      <ShotThumbnail colors={colors} size={30} />
    </span>
  )
}
