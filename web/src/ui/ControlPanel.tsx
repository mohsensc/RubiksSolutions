import { AnimatePresence, motion } from 'framer-motion'
import { useRef } from 'react'
import { Grid3x3, Paintbrush, RotateCcw, Undo2 } from 'lucide-react'
import { useCubeStore } from '../state/useCubeStore'
import { MoveHistory } from './MoveHistory'
import { MovePad } from './MovePad'
import { SolutionView, SolveControls } from './SolvePanel'
import { PhotoButton } from './capture/PhotoButton'
import { ToolButton } from './ToolButton'

function Toolbar() {
  const canUndo = useCubeStore((state) => state.history.length > 0)
  const isMovePadOpen = useCubeStore((state) => state.isMovePadOpen)
  const { reset, undo, setCustomizeOpen, setMovePadOpen } = useCubeStore.getState()
  return (
    <div className="flex gap-1.5">
      <ToolButton icon={RotateCcw} label="Reset" tip="Back to solved" onClick={reset} />
      <ToolButton icon={Paintbrush} label="Paint" tip="Set colors by hand" onClick={() => setCustomizeOpen(true)} />
      <PhotoButton />
      <ToolButton icon={Undo2} label="Undo" tip="Undo last move" onClick={undo} isDisabled={!canUndo} />
      <ToolButton
        icon={Grid3x3}
        label="Moves"
        tip="Face turn buttons"
        tipAlign="end"
        onClick={() => setMovePadOpen(!isMovePadOpen)}
        isPressed={isMovePadOpen}
      />
    </div>
  )
}

function revealOnCompactLayout(element: HTMLElement | null) {
  if (!element || window.matchMedia('(min-width: 1024px)').matches) return
  element.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

export function ControlPanel() {
  const isMovePadOpen = useCubeStore((state) => state.isMovePadOpen)
  const movePadRef = useRef<HTMLDivElement>(null)
  return (
    <div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1">
      <div data-sticky-controls className="max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:-mx-4 max-lg:bg-raised max-lg:px-4 max-lg:pb-1">
        <SolveControls />
      </div>
      <Toolbar />
      <AnimatePresence initial={false}>
        {isMovePadOpen && (
          <motion.div
            key="move-pad"
            ref={movePadRef}
            initial={{ opacity: 0, height: 0 }}
            animate="visible"
            variants={{ visible: { opacity: 1, height: 'auto' } }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            onAnimationComplete={(definition) => definition === 'visible' && revealOnCompactLayout(movePadRef.current)}
            className="shrink-0 overflow-hidden"
          >
            <MovePad />
          </motion.div>
        )}
      </AnimatePresence>
      <SolutionView />
      <MoveHistory />
      <span className="label mt-auto hidden shrink-0 lg:block pointer-coarse:hidden!">U R F D L B · shift for ′ · drag stickers</span>
    </div>
  )
}
