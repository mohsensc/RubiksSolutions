import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, LoaderCircle, Pause, Play, RotateCcw, Shuffle, StepBack, StepForward, Zap } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { isSolved } from '../cube/facelets'
import type { EngineStatus, SolveMethod } from '../engine/types'
import { stageDisplayName } from '../state/stages'
import {
  playbackSpeeds,
  selectIsBusy,
  selectIsPlaybackComplete,
  selectProjectedFacelets,
  useCubeStore,
  type PlaybackSpeed,
} from '../state/useCubeStore'
import { Segmented, type SegmentedOption } from './Segmented'
import { usePlaybackPosition } from './usePlaybackPosition'
import { useReducedMotion } from './useReducedMotion'

const methodOptions: SegmentedOption<SolveMethod>[] = [
  { value: 'optimal', label: 'Fastest', tip: 'Two-phase · ~20 moves' },
  { value: 'beginner', label: 'Beginner', tip: 'Layer by layer' },
  { value: 'cfop', label: 'CFOP', tip: 'Cross · F2L · OLL · PLL', tipAlign: 'end' },
]

const speedOptions: SegmentedOption<PlaybackSpeed>[] = playbackSpeeds.map((speed) => ({
  value: speed,
  label: `${speed}×`,
}))

function PlaybackButton({
  label,
  onClick,
  children,
  isPrimary = false,
  isDisabled = false,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  isPrimary?: boolean
  isDisabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      data-tip-side="bottom"
      onClick={onClick}
      disabled={isDisabled}
      className={`flex size-9 items-center justify-center rounded-full transition-[background-color,transform,border-color] duration-150 active:scale-[0.93] disabled:opacity-30 ${
        isPrimary
          ? 'bg-ink text-ground hover:bg-ink/90'
          : 'border border-line text-ink hover:border-line-strong hover:bg-ink/[0.04]'
      }`}
    >
      {children}
    </button>
  )
}

export function PlaybackControls({ isRestartShown = true }: { isRestartShown?: boolean }) {
  const isPlaying = useCubeStore((state) => state.isPlaying)
  const playbackCursor = useCubeStore((state) => state.playbackCursor)
  const moveCount = useCubeStore((state) => state.solution?.moves.length ?? 0)
  const isPlaybackComplete = useCubeStore(selectIsPlaybackComplete)
  const { togglePlay, stepBack, stepForward, restartPlayback } = useCubeStore.getState()
  return (
    <div className="flex items-center gap-1">
      {isRestartShown && (
        <PlaybackButton label="Restart" onClick={restartPlayback}>
          <RotateCcw size={15} strokeWidth={1.7} />
        </PlaybackButton>
      )}
      <PlaybackButton label="Step back" onClick={stepBack} isDisabled={playbackCursor === 0}>
        <StepBack size={15} strokeWidth={1.7} />
      </PlaybackButton>
      <PlaybackButton label={isPlaying ? 'Pause' : 'Play'} onClick={togglePlay} isPrimary={!isPlaybackComplete}>
        {isPlaying ? <Pause size={15} strokeWidth={2} /> : <Play size={15} strokeWidth={2} className="translate-x-px" />}
      </PlaybackButton>
      <PlaybackButton label="Step forward" onClick={stepForward} isDisabled={playbackCursor >= moveCount}>
        <StepForward size={15} strokeWidth={1.7} />
      </PlaybackButton>
    </div>
  )
}

function scrollChipIntoList(chip: HTMLElement, list: HTMLElement, behavior: ScrollBehavior) {
  if (list.scrollHeight <= list.clientHeight) return
  const edgeMargin = 28
  const listBounds = list.getBoundingClientRect()
  const chipBounds = chip.getBoundingClientRect()
  const overflowAbove = chipBounds.top - (listBounds.top + edgeMargin)
  const overflowBelow = chipBounds.bottom - (listBounds.bottom - edgeMargin)
  const scrollOffset = overflowAbove < 0 ? overflowAbove : overflowBelow > 0 ? overflowBelow : 0
  if (scrollOffset !== 0) list.scrollBy({ top: scrollOffset, behavior })
}

export function SolutionView() {
  const solution = useCubeStore((state) => state.solution)
  const speed = useCubeStore((state) => state.speed)
  const setSpeed = useCubeStore((state) => state.setSpeed)
  const { highlightIndex, currentStageIndex } = usePlaybackPosition()
  const activeChipRef = useRef<HTMLSpanElement | null>(null)
  const chipListRef = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    const activeChip = activeChipRef.current
    const chipList = chipListRef.current
    if (!activeChip || !chipList) return
    scrollChipIntoList(activeChip, chipList, prefersReducedMotion ? 'auto' : 'smooth')
  }, [highlightIndex, prefersReducedMotion])

  if (!solution) return null
  let runningIndex = 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex flex-col gap-4 max-lg:order-1 lg:min-h-0 lg:flex-1"
    >
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[28px] font-medium leading-none tracking-tight tabular-nums">{solution.moveCount}</span>
          <span className="label">moves</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[13px] tabular-nums text-ink">{solution.timeMs.toFixed(1)}</span>
          <span className="label">ms</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <PlaybackControls />
        <Segmented options={speedOptions} value={speed} onChange={setSpeed} indicatorId="speed" ariaLabel="Speed" isCompact />
      </div>

      <div
        ref={chipListRef}
        className="hairline-scroll fade-scroll -mx-1 flex max-h-40 flex-col gap-4 overflow-y-auto px-1 pt-2 pb-4 lg:max-h-none lg:min-h-0 lg:flex-1"
      >
        {solution.stages.map((stage, stageIndex) => {
          const stageStart = runningIndex
          runningIndex += stage.moves.length
          const isCurrentStage = stageIndex === currentStageIndex
          return (
            <section key={`${stage.name}-${stageIndex}`} aria-label={stage.name} className="flex flex-col gap-2">
              <header className="flex items-baseline justify-between gap-3">
                <span className={`label transition-colors ${isCurrentStage ? 'text-ink!' : ''}`}>
                  {stageDisplayName(stage.name, solution.startFacelets)}
                </span>
                <span className="flex items-baseline gap-2 font-mono text-[10px] text-faint">
                  {stage.case && <span className="text-muted">{stage.case}</span>}
                  <span>{stage.moves.length}</span>
                </span>
              </header>
              {stage.moves.length === 0 ? (
                <span className="font-mono text-[11px] text-faint">skip</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {stage.moves.map((move, offset) => {
                    const moveIndex = stageStart + offset
                    const isActive = moveIndex === highlightIndex
                    const isDone = moveIndex < highlightIndex
                    return (
                      <span
                        key={moveIndex}
                        ref={isActive ? activeChipRef : undefined}
                        className={`min-w-8 rounded-md border px-1.5 py-1 text-center font-mono text-[12px] transition-colors duration-200 ${
                          isActive
                            ? 'border-accent bg-accent text-accent-ink'
                            : isDone
                              ? 'border-line text-ink'
                              : 'border-line text-muted'
                        }`}
                      >
                        {move}
                      </span>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </motion.div>
  )
}

const solveTips: Record<EngineStatus, string | undefined> = {
  ready: undefined,
  booting: 'Solver starting',
  loading: 'Solver loading',
  missing: 'Solver not built',
  error: 'Solver failed to load',
}

export function PrimaryActions() {
  const isShuffling = useCubeStore((state) => state.isShuffling)
  const isSolving = useCubeStore((state) => state.isSolving)
  const engineStatus = useCubeStore((state) => state.engineStatus)
  const isCubeSolved = useCubeStore((state) => isSolved(selectProjectedFacelets(state)))
  const isBusy = useCubeStore(selectIsBusy)
  const hasSolution = useCubeStore((state) => state.solution !== null)
  const isPlaybackComplete = useCubeStore(selectIsPlaybackComplete)
  const { shuffle, solve } = useCubeStore.getState()
  const isEngineReady = engineStatus === 'ready'
  const isSolveDimmed = (isCubeSolved || hasSolution) && !isSolving
  const isShufflePrimary = isCubeSolved && (!hasSolution || isPlaybackComplete)

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={shuffle}
        disabled={isShuffling}
        className={`flex h-11 items-center justify-center gap-2 rounded-full border transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] disabled:opacity-60 ${
          isShufflePrimary
            ? 'border-transparent bg-ink text-ground hover:bg-ink/90'
            : 'border-line text-ink hover:border-line-strong hover:bg-ink/[0.04]'
        }`}
      >
        {isShuffling ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Shuffle size={16} strokeWidth={1.8} aria-hidden />}
        <span className="text-[14px] font-medium">Shuffle</span>
      </button>
      <button
        type="button"
        onClick={solve}
        disabled={!isEngineReady || isSolving || isBusy}
        data-tip={solveTips[engineStatus]}
        className={`flex h-11 items-center justify-center gap-2 rounded-full transition-[transform,opacity,background-color,color] duration-150 active:scale-[0.98] disabled:bg-ink/[0.06] disabled:text-faint ${
          isSolveDimmed ? 'border border-line text-muted hover:text-ink' : 'bg-accent text-accent-ink hover:bg-accent/90'
        }`}
      >
        {isSolving ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Zap size={16} strokeWidth={2} aria-hidden />}
        <span className="text-[14px] font-medium">{isSolving ? 'Solving' : 'Solve'}</span>
      </button>
    </div>
  )
}

function SolveMessage() {
  const solveMessage = useCubeStore((state) => state.solveMessage)
  return (
    <div role="status" aria-live="polite" className="empty:-mt-3">
      <AnimatePresence mode="wait">
        {solveMessage && (
          <motion.div
            key={solveMessage.text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-center justify-center gap-2 font-mono text-[12px] ${solveMessage.tone === 'error' ? 'text-danger' : 'text-muted'}`}
          >
            {solveMessage.tone === 'info' && <CircleCheck size={14} strokeWidth={1.8} className="text-accent" aria-hidden />}
            {solveMessage.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function SolveControls() {
  const solveMethod = useCubeStore((state) => state.solveMethod)
  const setSolveMethod = useCubeStore((state) => state.setSolveMethod)

  return (
    <div className="flex flex-col gap-3">
      <PrimaryActions />
      <Segmented options={methodOptions} value={solveMethod} onChange={setSolveMethod} indicatorId="method" ariaLabel="Solve method" isCompact />
      <SolveMessage />
    </div>
  )
}
