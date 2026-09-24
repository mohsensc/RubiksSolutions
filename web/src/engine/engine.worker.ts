import { applyMoves } from '../cube/moves'
import { generateScramble } from '../cube/scramble'
import type { EngineRequest, EngineResponse, EngineStatus } from './types'

type WrappedFunction = (...args: Array<string | number>) => string

interface QuickCubeModule {
  cwrap: (name: string, returnType: 'string', argumentTypes: Array<'string' | 'number'>) => WrappedFunction
}

type QuickCubeFactory = (options?: Record<string, unknown>) => Promise<QuickCubeModule>

interface EngineApi {
  validate: (facelets: string) => string
  apply: (facelets: string, moves: string) => string
  scramble: (seed: number, length: number) => string
  solve: (facelets: string, method: string) => string
}

const wasmModuleLoaders = import.meta.glob<{ default: QuickCubeFactory }>('../wasm/quickcube.js')

function post(message: EngineResponse) {
  self.postMessage(message)
}

function postStatus(status: EngineStatus, detail?: string) {
  post({ kind: 'status', status, detail })
}

async function bootEngine(): Promise<EngineApi | null> {
  const loadWasmModule = wasmModuleLoaders['../wasm/quickcube.js']
  if (!loadWasmModule) {
    postStatus('missing', 'engine not built')
    return null
  }
  postStatus('loading')
  try {
    const { default: createQuickCube } = await loadWasmModule()
    const wasmModule = await createQuickCube()
    const initResult = JSON.parse(wasmModule.cwrap('qc_init', 'string', [])())
    if (!initResult.ok) throw new Error(initResult.error ?? 'init failed')
    const engineApi: EngineApi = {
      validate: wasmModule.cwrap('qc_validate', 'string', ['string']),
      apply: wasmModule.cwrap('qc_apply', 'string', ['string', 'string']),
      scramble: wasmModule.cwrap('qc_scramble', 'string', ['number', 'number']),
      solve: wasmModule.cwrap('qc_solve', 'string', ['string', 'string']),
    }
    postStatus('ready')
    return engineApi
  } catch (error) {
    postStatus('error', error instanceof Error ? error.message : String(error))
    return null
  }
}

const enginePromise = bootEngine()

function parseEngineJson(raw: string): { ok: boolean; error?: string } & Record<string, unknown> {
  return JSON.parse(raw)
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

function fallback(request: EngineRequest): unknown {
  switch (request.type) {
    case 'scramble':
      return { ok: true, moves: generateScramble(request.length, seededRandom(request.seed)).join(' ') }
    case 'apply':
      return { ok: true, facelets: applyMoves(request.facelets, request.moves) }
    default:
      return null
  }
}

function runRequest(engineApi: EngineApi, request: EngineRequest) {
  switch (request.type) {
    case 'validate':
      return parseEngineJson(engineApi.validate(request.facelets))
    case 'apply':
      return parseEngineJson(engineApi.apply(request.facelets, request.moves))
    case 'scramble':
      return parseEngineJson(engineApi.scramble(request.seed, request.length))
    case 'solve':
      return parseEngineJson(engineApi.solve(request.facelets, request.method))
  }
}

self.addEventListener('message', async (event: MessageEvent<EngineRequest>) => {
  const request = event.data
  const engineApi = await enginePromise
  if (!engineApi) {
    const fallbackValue = fallback(request)
    if (fallbackValue) post({ kind: 'result', id: request.id, ok: true, value: fallbackValue })
    else post({ kind: 'result', id: request.id, ok: false, error: 'Engine not built', unavailable: true })
    return
  }
  try {
    const value = runRequest(engineApi, request)
    if (value.ok) post({ kind: 'result', id: request.id, ok: true, value })
    else post({ kind: 'result', id: request.id, ok: false, error: value.error ?? 'Engine error' })
  } catch (error) {
    post({ kind: 'result', id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})
