import { AnimatePresence, motion } from 'framer-motion'
import { stageDisplayName, stageExplainer } from '../state/stages'
import { useCubeStore } from '../state/useCubeStore'
import { useMediaQuery } from './useMediaQuery'
import { usePlaybackPosition } from './usePlaybackPosition'
import { useReducedMotion } from './useReducedMotion'

export function StageBanner() {
  const solution = useCubeStore((state) => state.solution)
  const isRoomy = useMediaQuery('(min-width: 1024px)')
  const prefersReducedMotion = useReducedMotion()
  const { appliedCount, currentStageIndex } = usePlaybackPosition()
  const isVisible = solution !== null && solution.moves.length > 0
  const isComplete = isVisible && appliedCount >= solution.moves.length
  const stage = isVisible && currentStageIndex >= 0 ? solution.stages[currentStageIndex] : null
  const title = isComplete ? `Solved · ${solution.moveCount} moves` : stage ? stageDisplayName(stage.name, solution!.startFacelets) : ''
  const stepLabel = isVisible && !isComplete ? `${currentStageIndex + 1}/${solution.stages.length}` : ''
  const subtitle = isRoomy && !isComplete && stage ? stageExplainer(stage.name) : ''
  const progress = isVisible ? appliedCount / solution.moves.length : 0

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="stage-banner"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: 6,
            transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
          }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          className="pointer-events-none flex w-[min(20rem,calc(100vw-2.5rem))] flex-col items-center gap-2 text-center"
          aria-live="polite"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24 }}
              className="flex flex-col items-center gap-1"
            >
              <span className="flex items-baseline gap-2">
                {stepLabel && <span className="label">{stepLabel}</span>}
                <span className="text-[15px] font-medium leading-tight tracking-tight lg:text-[22px]">{title}</span>
                {stage?.case && !isComplete && <span className="font-mono text-[10px] text-muted max-lg:text-[12px] pointer-coarse:text-[12px]">{stage.case}</span>}
              </span>
              {subtitle && <span className="text-[13px] text-muted">{subtitle}</span>}
            </motion.div>
          </AnimatePresence>
          <div className="h-px w-40 overflow-hidden bg-line">
            <motion.div
              className="h-full origin-left bg-accent"
              animate={{ scaleX: progress }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
