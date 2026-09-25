import type { EngineRequest, EngineResponse, EngineStatus, SolveMethod, SolveResult } from './types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

type RequestPayload = DistributiveOmit<EngineRequest, 'id'>

export class EngineError extends Error {
  readonly unavailable: boolean

  constructor(message: string, unavailable = false) {
    super(message)
    this.unavailable = unavailable
  }
}

type StatusListener = (status: EngineStatus, detail?: string) => void

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: EngineError) => void
}

class EngineClient {
  private worker: Worker | null = null
  private nextRequestId = 1
  private pendingRequests = new Map<number, PendingRequest>()
  private statusListeners = new Set<StatusListener>()
  status: EngineStatus = 'booting'
  statusDetail: string | undefined

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (event: MessageEvent<EngineResponse>) => this.handleMessage(event.data))
    worker.addEventListener('error', (event) => this.handleWorkerFailure(event.message || 'Engine crashed'))
    this.worker = worker
    return worker
  }

  private handleWorkerFailure(message: string) {
    this.worker?.terminate()
    this.worker = null
    const failedRequests = [...this.pendingRequests.values()]
    this.pendingRequests.clear()
    failedRequests.forEach((pending) => pending.reject(new EngineError(message, true)))
    this.setStatus('error', message)
  }

  private handleMessage(message: EngineResponse) {
    if (message.kind === 'status') {
      this.setStatus(message.status, message.detail)
      return
    }
    const pending = this.pendingRequests.get(message.id)
    if (!pending) return
    this.pendingRequests.delete(message.id)
    if (message.ok) pending.resolve(message.value)
    else pending.reject(new EngineError(message.error, message.unavailable))
  }

  private setStatus(status: EngineStatus, detail?: string) {
    this.status = status
    this.statusDetail = detail
    this.statusListeners.forEach((listener) => listener(status, detail))
  }

  private request<T>(payload: RequestPayload): Promise<T> {
    const worker = this.ensureWorker()
    const id = this.nextRequestId++
    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject })
      worker.postMessage({ ...payload, id })
    })
  }

  start() {
    this.ensureWorker()
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.status, this.statusDetail)
    return () => this.statusListeners.delete(listener)
  }

  validate(facelets: string) {
    return this.request<{ ok: true }>({ type: 'validate', facelets })
  }

  solve(facelets: string, method: SolveMethod) {
    return this.request<SolveResult>({ type: 'solve', facelets, method })
  }

  async scramble(length: number, seed = Math.floor(Math.random() * 2147483647)) {
    const result = await this.request<{ moves: string }>({ type: 'scramble', seed, length })
    return result.moves
  }

  async apply(facelets: string, moves: string) {
    const result = await this.request<{ facelets: string }>({ type: 'apply', facelets, moves })
    return result.facelets
  }
}

export const engine = new EngineClient()
