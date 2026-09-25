import type { ShotDetection } from './types'

export const maximumFrameGapMs = 250
export const allowedMissedFrames = 1

export function stableDetectionTracker(requiredMs: number) {
  let stableMs = 0
  let lastDetectedAt: number | null = null
  let missedFrames = 0
  const reset = () => {
    stableMs = 0
    lastDetectedAt = null
    missedFrames = 0
  }
  return {
    update(detection: ShotDetection, nowMs: number): boolean {
      if (!detection.detected) {
        missedFrames++
        if (missedFrames > allowedMissedFrames) reset()
        return false
      }
      const isContinuing = lastDetectedAt !== null && nowMs - lastDetectedAt <= maximumFrameGapMs * (missedFrames + 1)
      if (!isContinuing) stableMs = 0
      else if (missedFrames === 0 && lastDetectedAt !== null) stableMs += nowMs - lastDetectedAt
      lastDetectedAt = nowMs
      missedFrames = 0
      return stableMs >= requiredMs
    },
    reset,
  }
}
