import { describe, expect, it } from 'vitest'
import { detectShot } from '../../vision'
import { defaultScene, renderScene } from '../../vision/__fixtures__/syntheticPhoto'
import { createShotDetector } from './shotDetector'

describe('createShotDetector', () => {
  it('detects inline when workers are unavailable', async () => {
    const { image, template } = renderScene(defaultScene({ seed: 3 }))
    const detector = createShotDetector()
    const detection = await detector.detect(image as unknown as ImageData, template, {})
    expect(detection).toEqual(detectShot(image, template, {}))
    expect(detection.detected).toBe(true)
    detector.dispose()
  })
})
