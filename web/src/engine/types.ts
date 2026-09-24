export type SolveMethod = 'optimal' | 'beginner' | 'cfop'

export type EngineStatus = 'booting' | 'loading' | 'ready' | 'missing' | 'error'

export interface SolveStage {
  name: string
  moves: string[]
  case?: string
}

export interface SolveResult {
  ok: true
  method: SolveMethod
  moves: string[]
  moveCount: number
  timeMs: number
  stages: SolveStage[]
}

export interface ValidateResult {
  ok: boolean
  error?: string
}

export type EngineRequest =
  | { id: number; type: 'validate'; facelets: string }
  | { id: number; type: 'solve'; facelets: string; method: SolveMethod }
  | { id: number; type: 'scramble'; seed: number; length: number }
  | { id: number; type: 'apply'; facelets: string; moves: string }

export type EngineResponse =
  | { kind: 'status'; status: EngineStatus; detail?: string }
  | { kind: 'result'; id: number; ok: true; value: unknown }
  | { kind: 'result'; id: number; ok: false; error: string; unavailable?: boolean }
