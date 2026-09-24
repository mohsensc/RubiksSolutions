import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSolved, solvedFacelets } from '../cube/facelets'
import { applyMove, applyMoves, invertSequence, type Move } from '../cube/moves'
import { engine } from '../engine/engineClient'
import type { SolveResult } from '../engine/types'
import { selectIsPlaybackComplete, useCubeStore } from './useCubeStore'

function drainQueue() {
  const store = useCubeStore.getState
  for (let guard = 0; guard < 500; guard++) {
    const item = store().takeNextItem()
    if (!item) return
    const nextFacelets = item.kind === 'set' ? item.facelets : applyMove(store().facelets, item.move)
    store().completeItem(item, nextFacelets)
  }
}

function loadSolution(scramble: Move[]) {
  const startFacelets = applyMoves(solvedFacelets, scramble)
  const solutionMoves = invertSequence(scramble)
  useCubeStore.setState({
    facelets: startFacelets,
    solution: {
      id: 0,
      method: 'cfop',
      startFacelets,
      moveCount: solutionMoves.length,
      timeMs: 1,
      stages: [
        { name: 'Cross', moves: solutionMoves.slice(0, 2) },
        { name: 'PLL', moves: solutionMoves.slice(2), case: 'T-perm' },
      ],
      moves: solutionMoves.map((move, index) => ({ move, stageIndex: index < 2 ? 0 : 1 })),
    },
    playbackIndex: 0,
    playbackCursor: 0,
    isPlaying: false,
  })
}

describe('cube store', () => {
  beforeEach(() => {
    useCubeStore.setState({ facelets: solvedFacelets, queue: [], activeItem: null, history: [], solution: null, isSolving: false, solveMethod: 'optimal', isCustomizeOpen: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies user moves and undoes them', () => {
    const { userMove, undo } = useCubeStore.getState()
    userMove('R')
    userMove("U'")
    drainQueue()
    expect(useCubeStore.getState().history).toEqual(['R', "U'"])
    undo()
    undo()
    drainQueue()
    expect(useCubeStore.getState().facelets).toBe(solvedFacelets)
    expect(useCubeStore.getState().history).toEqual([])
  })

  it('plays a solution through to solved', () => {
    loadSolution(['R', 'U', "F'", 'L2', 'D'])
    useCubeStore.getState().togglePlay()
    drainQueue()
    const state = useCubeStore.getState()
    expect(state.facelets).toBe(solvedFacelets)
    expect(state.playbackIndex).toBe(5)
    expect(state.isPlaying).toBe(false)
  })

  it('steps forward, back and restarts', () => {
    const scramble: Move[] = ['R', 'U', "F'"]
    loadSolution(scramble)
    const store = useCubeStore.getState
    store().stepForward()
    store().stepForward()
    store().stepBack()
    drainQueue()
    expect(store().playbackIndex).toBe(1)
    expect(store().facelets).toBe(applyMove(store().solution!.startFacelets, 'F'))
    store().restartPlayback()
    drainQueue()
    expect(store().playbackIndex).toBe(0)
    expect(store().facelets).toBe(store().solution!.startFacelets)
  })

  it('drops the solution when the user turns a face', () => {
    loadSolution(['R'])
    useCubeStore.getState().userMove('U')
    expect(useCubeStore.getState().solution).toBeNull()
  })

  it('ignores a solve that returns after the cube changed', async () => {
    let resolveSolve: (result: SolveResult) => void = () => {}
    vi.spyOn(engine, 'solve').mockImplementation(() => new Promise((resolve) => (resolveSolve = resolve)))
    const store = useCubeStore.getState
    store().userMove('R')
    drainQueue()
    const pendingSolve = store().solve()
    expect(store().isSolving).toBe(true)
    store().userMove('U')
    expect(store().isSolving).toBe(false)
    resolveSolve({ ok: true, method: 'optimal', moves: ["R'"], moveCount: 1, timeMs: 1, stages: [{ name: 'Two-phase', moves: ["R'"] }] })
    await pendingSolve
    expect(store().solution).toBeNull()
    drainQueue()
    expect(isSolved(store().facelets)).toBe(false)
  })

  it('applies a solve that returns while the cube is unchanged', async () => {
    vi.spyOn(engine, 'solve').mockResolvedValue({
      ok: true,
      method: 'optimal',
      moves: ["R'"],
      moveCount: 1,
      timeMs: 1,
      stages: [{ name: 'Two-phase', moves: ["R'"] }],
    })
    const store = useCubeStore.getState
    store().userMove('R')
    drainQueue()
    await store().solve()
    expect(store().solution?.moves).toEqual([{ move: "R'", stageIndex: 0 }])
    store().togglePlay()
    drainQueue()
    expect(isSolved(store().facelets)).toBe(true)
  })

  it('falls back to a local scramble when the engine fails', async () => {
    vi.spyOn(engine, 'scramble').mockRejectedValue(new Error('engine down'))
    const store = useCubeStore.getState
    await store().shuffle()
    expect(store().history).toHaveLength(25)
    expect(store().isShuffling).toBe(false)
  })

  it('pauses playback when the paint sheet opens', () => {
    loadSolution(['R', 'U'])
    const store = useCubeStore.getState
    store().togglePlay()
    store().setCustomizeOpen(true)
    expect(store().isPlaying).toBe(false)
    store().setCustomizeOpen(false)
  })

  it('re-solves from the scramble when the method changes', async () => {
    const scramble: Move[] = ['R', 'U']
    loadSolution(scramble)
    const startFacelets = useCubeStore.getState().solution!.startFacelets
    const solveSpy = vi.spyOn(engine, 'solve').mockResolvedValue({
      ok: true,
      method: 'beginner',
      moves: ["U'", "R'"],
      moveCount: 2,
      timeMs: 1,
      stages: [{ name: 'First cross', moves: ["U'", "R'"] }],
    })
    const store = useCubeStore.getState
    store().togglePlay()
    const inFlightTurn = store().takeNextItem()!
    store().setSolveMethod('beginner')
    expect(store().solution).toBeNull()
    expect(solveSpy).toHaveBeenCalledWith(startFacelets, 'beginner')
    await vi.waitFor(() => expect(store().solution?.method).toBe('beginner'))
    store().completeItem(inFlightTurn, applyMove(startFacelets, "U'"))
    drainQueue()
    expect(store().facelets).toBe(startFacelets)
    expect(store().playbackIndex).toBe(0)
  })

  it('keeps the solution when an unchanged paint draft is applied', () => {
    loadSolution(['R', 'U'])
    const store = useCubeStore.getState
    store().setCustomizeOpen(true)
    store().applyCustomFacelets(store().facelets)
    expect(store().solution).not.toBeNull()
    expect(store().queue).toHaveLength(0)
    expect(store().isCustomizeOpen).toBe(false)
  })

  it('reports playback completion', () => {
    loadSolution(['R', 'U'])
    const store = useCubeStore.getState
    expect(selectIsPlaybackComplete(store())).toBe(false)
    store().togglePlay()
    drainQueue()
    expect(selectIsPlaybackComplete(store())).toBe(true)
  })
})
