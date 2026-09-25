import { AnimatePresence, motion } from 'framer-motion'
import { useCubeStore } from '../state/useCubeStore'

const visibleMoveCount = 30

export function MoveHistory() {
  const history = useCubeStore((state) => state.history)
  const hiddenCount = Math.max(0, history.length - visibleMoveCount)
  const visibleMoves = history.slice(-visibleMoveCount)
  if (history.length === 0) return null
  return (
    <motion.section
      aria-label="Move history"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.22 }}
      className="flex shrink-0 flex-col gap-2"
    >
      <div className="flex items-baseline justify-between">
        <span className="label">History</span>
        <span className="font-mono text-[10px] text-muted max-lg:text-[12px] pointer-coarse:text-[12px]">{history.length}</span>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-[13px]">
        {hiddenCount > 0 && <span className="text-muted">+{hiddenCount}</span>}
        <AnimatePresence initial={false}>
          {visibleMoves.map((move, index) => (
            <motion.span
              key={hiddenCount + index}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: index === visibleMoves.length - 1 ? 1 : 0.62, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="text-ink"
            >
              {move}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}
