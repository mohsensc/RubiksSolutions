import { AnimatePresence, motion } from 'framer-motion'
import { Grid3x3, Paintbrush, RotateCcw, Undo2 } from 'lucide-react'
import { useCubeStore } from '../state/useCubeStore'
import { MoveHistory } from './MoveHistory'
import { MovePad } from './MovePad'
import { SolutionView, SolveControls } from './SolvePanel'
import { ToolButton } from './ToolButton'

function Toolbar() {
  const canUndo = useCubeStore((state) => state.history.length > 0)
  const isMovePadOpen = useCubeStore((state) => state.isMovePadOpen)
  const { reset, undo, setCustomizeOpen, setMovePadOpen } = useCubeStore.getState()
  return (
    <div className="flex gap-1.5 max-lg:order-2">
      <ToolButton icon={RotateCcw} label="Reset" tip="Back to solved" onClick={reset} />
      <ToolButton icon={Paintbrush} label="Paint" tip="Set colors by hand" onClick={() => setCustomizeOpen(true)} />
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

export function ControlPanel() {
  const isMovePadOpen = useCubeStore((state) => state.isMovePadOpen)
  return (
    <div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1">
      <SolveControls />
      <Toolbar />
      <AnimatePresence initial={false}>
        {isMovePadOpen && (
          <motion.div
            key="move-pad"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="shrink-0 overflow-hidden max-lg:order-2"
          >
            <MovePad />
          </motion.div>
        )}
      </AnimatePresence>
      <SolutionView />
      <MoveHistory />
      <span className="label mt-auto hidden shrink-0 lg:block">U R F D L B · shift for ′ · drag stickers</span>
    </div>
  )
}
