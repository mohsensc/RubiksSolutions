import { AnimatePresence, motion } from 'framer-motion'
import type { EngineStatus } from '../engine/types'
import { useCubeStore } from '../state/useCubeStore'

const statusAppearance: Record<Exclude<EngineStatus, 'ready'>, { text: string; dotClass: string; tip: string }> = {
  booting: { text: 'starting', dotClass: 'bg-muted animate-[pulse-dot_1.2s_ease-in-out_infinite]', tip: 'Starting solver' },
  loading: { text: 'loading', dotClass: 'bg-accent animate-[pulse-dot_1.2s_ease-in-out_infinite]', tip: 'Building solver tables' },
  missing: { text: 'offline', dotClass: 'bg-faint', tip: 'Solver not built · play only' },
  error: { text: 'solver error', dotClass: 'bg-danger', tip: 'Solver failed to load' },
}

export function EnginePill() {
  const engineStatus = useCubeStore((state) => state.engineStatus)
  const appearance = engineStatus === 'ready' ? null : statusAppearance[engineStatus]
  return (
    <div role="status" aria-live="polite">
      <AnimatePresence>
        {appearance && (
          <motion.div
            key="engine-pill"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            data-tip={appearance.tip}
            data-tip-side="bottom"
            data-tip-align="end"
            className="flex items-center gap-2 rounded-full border border-line px-2.5 py-1"
          >
            <span className={`size-1.5 rounded-full ${appearance.dotClass}`} />
            <span className="label">{appearance.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
