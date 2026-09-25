import { detectShot } from '../../vision'
import type { DetectionRequest, DetectionResponse } from './shotDetector'

self.addEventListener('message', (event: MessageEvent<DetectionRequest>) => {
  const { id, width, height, buffer, template, options } = event.data
  let response: DetectionResponse
  try {
    response = { id, detection: detectShot({ width, height, data: new Uint8ClampedArray(buffer) }, template, options) }
  } catch (error) {
    response = { id, failure: error instanceof Error ? error.message : 'Detection failed' }
  }
  self.postMessage(response)
})
