import { useIsPresent } from 'framer-motion'
import { useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCubeStore } from '../state/useCubeStore'

export function usePresenceSnapshot<T>(value: T): T {
  const isPresent = useIsPresent()
  const snapshotRef = useRef(value)
  if (isPresent) snapshotRef.current = value
  return snapshotRef.current
}

export function usePlaybackPosition() {
  return useCubeStore(
    useShallow((state) => {
      const { solution, activeItem, playbackIndex } = state
      if (!solution) return { highlightIndex: -1, appliedCount: 0, currentStageIndex: -1 }
      const activeSolutionIndex =
        activeItem?.kind === 'turn' && activeItem.origin === 'solution' && activeItem.solutionId === solution.id
          ? (activeItem.solutionIndex ?? -1)
          : -1
      const highlightIndex = activeSolutionIndex >= 0 ? activeSolutionIndex : playbackIndex - 1
      const referenceIndex = Math.min(
        solution.moves.length - 1,
        activeSolutionIndex >= 0 ? activeSolutionIndex : playbackIndex,
      )
      const currentStageIndex = referenceIndex >= 0 ? solution.moves[referenceIndex].stageIndex : -1
      return { highlightIndex, appliedCount: playbackIndex, currentStageIndex }
    }),
  )
}
