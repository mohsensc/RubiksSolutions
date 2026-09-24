import { create } from 'zustand'
import { isSolved, solvedFacelets } from '../cube/facelets'
import { applyMove, invertMove, isMove, type Move } from '../cube/moves'
import { generateScramble } from '../cube/scramble'
import { engine, EngineError } from '../engine/engineClient'
import type { EngineStatus, SolveMethod, SolveResult } from '../engine/types'

export type MoveOrigin = 'user' | 'shuffle' | 'undo' | 'solution'

export type QueueItem =
  | { kind: 'turn'; id: number; move: Move; origin: MoveOrigin; solutionId?: number; solutionIndex?: number; direction?: 1 | -1 }
  | { kind: 'set'; id: number; facelets: string; playbackIndex?: number }

export interface SolutionMove {
  move: Move
  stageIndex: number
}

export interface Solution {
  id: number
  method: SolveMethod
  startFacelets: string
  moveCount: number
  timeMs: number
  stages: SolveResult['stages']
  moves: SolutionMove[]
}

export const playbackSpeeds = [0.5, 1, 2, 4] as const

export type PlaybackSpeed = (typeof playbackSpeeds)[number]

interface CubeState {
  facelets: string
  queue: QueueItem[]
  activeItem: QueueItem | null
  history: Move[]
  speed: PlaybackSpeed
  engineStatus: EngineStatus
  solveMethod: SolveMethod
  isSolving: boolean
  solveMessage: { tone: 'info' | 'error'; text: string } | null
  solution: Solution | null
  playbackIndex: number
  playbackCursor: number
  isPlaying: boolean
  isMovePadOpen: boolean
  isCustomizeOpen: boolean
  isShuffling: boolean
  userMove: (move: Move) => void
  undo: () => void
  shuffle: () => Promise<void>
  reset: () => void
  applyCustomFacelets: (facelets: string) => void
  takeNextItem: () => QueueItem | null
  completeItem: (item: QueueItem, facelets: string) => void
  setSpeed: (speed: PlaybackSpeed) => void
  setSolveMethod: (method: SolveMethod) => void
  solve: () => Promise<void>
  togglePlay: () => void
  stepForward: () => void
  stepBack: () => void
  restartPlayback: () => void
  setMovePadOpen: (isOpen: boolean) => void
  setCustomizeOpen: (isOpen: boolean) => void
  setEngineStatus: (status: EngineStatus) => void
}

const shuffleLength = 25

let nextItemId = 1

let solveRequestId = 0

let nextSolutionId = 1

function turnItem(move: Move, origin: MoveOrigin, extra: Partial<QueueItem> = {}): QueueItem {
  return { kind: 'turn', id: nextItemId++, move, origin, ...extra } as QueueItem
}

function isSolutionTurn(item: QueueItem | null | undefined): boolean {
  return item?.kind === 'turn' && item.origin === 'solution'
}

function withoutPendingSolutionItems(queue: QueueItem[]): QueueItem[] {
  return queue.filter((item) => !isSolutionTurn(item))
}

function projectedFacelets(state: Pick<CubeState, 'facelets' | 'queue' | 'activeItem'>): string {
  const pendingItems = state.activeItem ? [state.activeItem, ...state.queue] : state.queue
  return pendingItems.reduce(
    (facelets, item) => (item.kind === 'set' ? item.facelets : applyMove(facelets, item.move)),
    state.facelets,
  )
}

export const useCubeStore = create<CubeState>((set, get) => {
  const enqueue = (...items: QueueItem[]) => set((state) => ({ queue: [...state.queue, ...items] }))

  const enqueueNextSolutionMove = () => {
    const { solution, playbackCursor } = get()
    if (!solution || playbackCursor >= solution.moves.length) return false
    enqueue(turnItem(solution.moves[playbackCursor].move, 'solution', { solutionId: solution.id, solutionIndex: playbackCursor, direction: 1 }))
    set({ playbackCursor: playbackCursor + 1 })
    return true
  }

  const clearSolution = () => set({ solution: null, isPlaying: false, playbackIndex: 0, playbackCursor: 0, solveMessage: null })

  const cancelPendingSolve = () => {
    solveRequestId++
    if (get().isSolving) set({ isSolving: false })
  }

  const replaceState = (facelets: string) => {
    cancelPendingSolve()
    clearSolution()
    set((state) => ({ queue: [...withoutPendingSolutionItems(state.queue), { kind: 'set', id: nextItemId++, facelets }], history: [] }))
  }

  return {
    facelets: solvedFacelets,
    queue: [],
    activeItem: null,
    history: [],
    speed: 1,
    engineStatus: 'booting',
    solveMethod: 'optimal',
    isSolving: false,
    solveMessage: null,
    solution: null,
    playbackIndex: 0,
    playbackCursor: 0,
    isPlaying: false,
    isMovePadOpen: false,
    isCustomizeOpen: false,
    isShuffling: false,

    userMove: (move) => {
      cancelPendingSolve()
      if (get().solution) {
        clearSolution()
        set((state) => ({ queue: withoutPendingSolutionItems(state.queue) }))
      }
      set((state) => ({ history: [...state.history, move] }))
      enqueue(turnItem(move, 'user'))
    },

    undo: () => {
      const { history } = get()
      const lastMove = history[history.length - 1]
      if (!lastMove) return
      cancelPendingSolve()
      if (get().solution) {
        clearSolution()
        set((state) => ({ queue: withoutPendingSolutionItems(state.queue) }))
      }
      set({ history: history.slice(0, -1) })
      enqueue(turnItem(invertMove(lastMove), 'undo'))
    },

    shuffle: async () => {
      if (get().isShuffling) return
      set({ isShuffling: true })
      const scramble = await engine
        .scramble(shuffleLength)
        .then((moves) => moves.split(/\s+/).filter(isMove))
        .catch(() => generateScramble(shuffleLength))
      cancelPendingSolve()
      clearSolution()
      set((state) => ({
        queue: withoutPendingSolutionItems(state.queue),
        history: [...state.history, ...scramble],
        isShuffling: false,
      }))
      enqueue(...scramble.map((move) => turnItem(move, 'shuffle')))
    },

    reset: () => replaceState(solvedFacelets),

    applyCustomFacelets: (facelets) => {
      if (facelets !== projectedFacelets(get())) replaceState(facelets)
      set({ isCustomizeOpen: false })
    },

    takeNextItem: () => {
      const [nextItem, ...remaining] = get().queue
      if (!nextItem) return null
      set({ queue: remaining, activeItem: nextItem })
      return nextItem
    },

    completeItem: (item, facelets) => {
      const update: Partial<CubeState> = { facelets, activeItem: null }
      if (item.kind === 'set' && item.playbackIndex !== undefined) update.playbackIndex = item.playbackIndex
      const isCurrentSolutionTurn = item.kind === 'turn' && item.origin === 'solution' && item.solutionId === get().solution?.id
      if (isCurrentSolutionTurn && item.solutionIndex !== undefined) {
        update.playbackIndex = item.direction === -1 ? item.solutionIndex : item.solutionIndex + 1
      }
      set(update)
      const state = get()
      if (!state.isPlaying || !state.solution) return
      if (state.queue.some(isSolutionTurn)) return
      if (!enqueueNextSolutionMove()) set({ isPlaying: false })
    },

    setSpeed: (speed) => set({ speed }),

    setSolveMethod: (solveMethod) => {
      const { solution, isSolving, solveMethod: currentMethod } = get()
      if (solveMethod === currentMethod) return
      set({ solveMethod })
      if (!solution && !isSolving) return
      cancelPendingSolve()
      clearSolution()
      set((state) => ({ queue: withoutPendingSolutionItems(state.queue) }))
      if (solution && projectedFacelets(get()) !== solution.startFacelets) {
        enqueue({ kind: 'set', id: nextItemId++, facelets: solution.startFacelets })
      }
      void get().solve()
    },

    solve: async () => {
      const state = get()
      if (state.isSolving) return
      const startFacelets = projectedFacelets(state)
      if (isSolved(startFacelets)) {
        clearSolution()
        set({ solveMessage: { tone: 'info', text: 'Already solved' } })
        return
      }
      const requestId = ++solveRequestId
      const isCurrentRequest = () => requestId === solveRequestId && projectedFacelets(get()) === startFacelets
      set({ isSolving: true, solveMessage: null })
      try {
        const result = await engine.solve(startFacelets, state.solveMethod)
        if (!isCurrentRequest()) return
        const moves = result.stages.flatMap((stage, stageIndex) =>
          stage.moves.filter(isMove).map((move) => ({ move, stageIndex })),
        )
        set({
          solution: {
            id: nextSolutionId++,
            method: result.method,
            startFacelets,
            moveCount: result.moveCount,
            timeMs: result.timeMs,
            stages: result.stages,
            moves,
          },
          playbackIndex: 0,
          playbackCursor: 0,
          isPlaying: false,
          history: [],
        })
        if (moves.length === 0) set({ solveMessage: { tone: 'info', text: 'Already solved' } })
      } catch (error) {
        if (!isCurrentRequest()) return
        const text = error instanceof EngineError || error instanceof Error ? error.message : 'Solve failed'
        set({ solveMessage: { tone: 'error', text } })
      } finally {
        if (requestId === solveRequestId) set({ isSolving: false })
      }
    },

    togglePlay: () => {
      const { solution, isPlaying, playbackCursor, queue } = get()
      if (!solution) return
      if (isPlaying) {
        set({ isPlaying: false })
        return
      }
      if (playbackCursor >= solution.moves.length && queue.length === 0) {
        set({ queue: [...queue, { kind: 'set', id: nextItemId++, facelets: solution.startFacelets, playbackIndex: 0 }], playbackCursor: 0 })
      }
      set({ isPlaying: true })
      const { queue: currentQueue, activeItem } = get()
      if (!currentQueue.some(isSolutionTurn) && !isSolutionTurn(activeItem)) enqueueNextSolutionMove()
    },

    stepForward: () => {
      set({ isPlaying: false })
      enqueueNextSolutionMove()
    },

    stepBack: () => {
      const { solution, playbackCursor } = get()
      set({ isPlaying: false })
      if (!solution || playbackCursor <= 0) return
      const solutionIndex = playbackCursor - 1
      enqueue(turnItem(invertMove(solution.moves[solutionIndex].move), 'solution', { solutionId: solution.id, solutionIndex, direction: -1 }))
      set({ playbackCursor: solutionIndex })
    },

    restartPlayback: () => {
      const { solution } = get()
      if (!solution) return
      set((state) => ({
        isPlaying: false,
        playbackCursor: 0,
        queue: [...withoutPendingSolutionItems(state.queue), { kind: 'set', id: nextItemId++, facelets: solution.startFacelets, playbackIndex: 0 }],
      }))
    },

    setMovePadOpen: (isMovePadOpen) => set({ isMovePadOpen }),

    setCustomizeOpen: (isCustomizeOpen) => set(isCustomizeOpen ? { isCustomizeOpen, isPlaying: false } : { isCustomizeOpen }),

    setEngineStatus: (engineStatus) => set({ engineStatus }),
  }
})

export function selectIsBusy(state: CubeState): boolean {
  return state.activeItem !== null || state.queue.length > 0
}

export function selectIsPlaybackComplete(state: CubeState): boolean {
  const moveCount = state.solution?.moves.length ?? 0
  return moveCount > 0 && state.playbackIndex >= moveCount && state.playbackCursor >= moveCount
}

export function selectProjectedFacelets(state: CubeState): string {
  return projectedFacelets(state)
}
