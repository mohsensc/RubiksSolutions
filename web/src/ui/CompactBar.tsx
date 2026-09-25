import { selectIsPlaybackComplete, useCubeStore } from '../state/useCubeStore'
import { PlaybackControls, PrimaryActions } from './SolvePanel'
import { usePlaybackPosition } from './usePlaybackPosition'

export function CompactBar() {
  const moveCount = useCubeStore((state) => state.solution?.moves.length ?? 0)
  const isPlaybackComplete = useCubeStore(selectIsPlaybackComplete)
  const { appliedCount } = usePlaybackPosition()
  if (moveCount === 0 || isPlaybackComplete) return <PrimaryActions />
  return (
    <div className="flex h-11 items-center justify-between gap-3">
      <PlaybackControls isRestartShown={false} />
      <span className="font-mono text-[12px] tabular-nums text-muted">
        {appliedCount}/{moveCount}
      </span>
    </div>
  )
}
