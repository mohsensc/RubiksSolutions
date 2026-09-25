import { detectShot, type DetectOptions, type FrameTemplate, type ShotDetection } from '../../vision'

export interface DetectionRequest {
  kind: 'detect'
  id: number
  width: number
  height: number
  buffer: ArrayBuffer
  template: FrameTemplate
  options: DetectOptions
}

export type DetectionResponse = { id: number; detection: ShotDetection } | { id: number; failure: string }

export interface ShotDetector {
  detect: (frame: ImageData, template: FrameTemplate, options: DetectOptions) => Promise<ShotDetection>
  dispose: () => void
}

interface PendingDetection {
  resolve: (detection: ShotDetection) => void
  reject: (error: Error) => void
}

function startWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('./detection.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
}

export function createShotDetector(): ShotDetector {
  let worker = startWorker()
  const pending = new Map<number, PendingDetection>()
  let nextRequestId = 1

  const failAll = (reason: string) => {
    pending.forEach(({ reject }) => reject(new Error(reason)))
    pending.clear()
  }

  if (worker) {
    worker.addEventListener('message', (event: MessageEvent<DetectionResponse>) => {
      const request = pending.get(event.data.id)
      if (!request) return
      pending.delete(event.data.id)
      if ('detection' in event.data) request.resolve(event.data.detection)
      else request.reject(new Error(event.data.failure))
    })
    worker.addEventListener('error', () => {
      worker?.terminate()
      worker = null
      failAll('Detection worker stopped')
    })
  }

  return {
    detect(frame, template, options) {
      if (!worker) {
        try {
          return Promise.resolve(detectShot(frame, template, options))
        } catch (error) {
          return Promise.reject(error instanceof Error ? error : new Error('Detection failed'))
        }
      }
      const id = nextRequestId++
      const request: DetectionRequest = { kind: 'detect', id, width: frame.width, height: frame.height, buffer: frame.data.buffer as ArrayBuffer, template, options }
      const activeWorker = worker
      return new Promise<ShotDetection>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        activeWorker.postMessage(request, [request.buffer])
      })
    },
    dispose() {
      worker?.terminate()
      worker = null
      failAll('Detection stopped')
    },
  }
}
