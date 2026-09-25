import { describe, expect, it } from 'vitest'
import { detectShot, type FrameTemplate, type ImageLike } from '../../vision'
import { firstShotPose, randomCubeState, realisticShot } from '../../vision/__fixtures__/photoScenarios'
import { seededRandom } from '../../vision/__fixtures__/syntheticPhoto'
import { analysisMaximumShorterSide, liveAnalysisSize } from './liveAnalysis'

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function videoRoundTrip(image: ImageLike, gain = 1): ImageLike {
  const { width, height, data } = image
  const luma = new Float32Array(width * height)
  const blueDifference = new Float32Array(width * height)
  const redDifference = new Float32Array(width * height)
  for (let pixel = 0; pixel < width * height; pixel++) {
    const red = data[pixel * 4] * gain
    const green = data[pixel * 4 + 1] * gain
    const blue = data[pixel * 4 + 2] * gain
    luma[pixel] = Math.round(16 + (65.481 * red + 128.553 * green + 24.966 * blue) / 255)
    blueDifference[pixel] = 128 + (-37.797 * red - 74.203 * green + 112 * blue) / 255
    redDifference[pixel] = 128 + (112 * red - 93.786 * green - 18.214 * blue) / 255
  }
  const output = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const blockX = x - (x % 2)
      const blockY = y - (y % 2)
      let blueSum = 0
      let redSum = 0
      let count = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (blockX + dx >= width || blockY + dy >= height) continue
          blueSum += blueDifference[(blockY + dy) * width + blockX + dx]
          redSum += redDifference[(blockY + dy) * width + blockX + dx]
          count++
        }
      }
      const pixel = y * width + x
      const scaledLuma = (luma[pixel] - 16) * (255 / 219)
      const blueChroma = Math.round(blueSum / count) - 128
      const redChroma = Math.round(redSum / count) - 128
      output[pixel * 4] = clampByte(scaledLuma + 1.402 * (255 / 224) * redChroma)
      output[pixel * 4 + 1] = clampByte(scaledLuma - (255 / 224) * (0.344136 * blueChroma + 0.714136 * redChroma))
      output[pixel * 4 + 2] = clampByte(scaledLuma + 1.772 * (255 / 224) * blueChroma)
      output[pixel * 4 + 3] = 255
    }
  }
  return { width, height, data: output }
}

describe('live camera analysis', () => {
  it('keeps the native frame up to the analysis cap', () => {
    expect(liveAnalysisSize({ width: 720, height: 1280 })).toEqual({ width: 720, height: 1280 })
    expect(liveAnalysisSize({ width: 1080, height: 1920 })).toEqual({ width: analysisMaximumShorterSide, height: 1280 })
    expect(liveAnalysisSize({ width: 480, height: 640 })).toEqual({ width: 480, height: 640 })
  })

  it('detects cubes in frames that went through 4:2:0 video encoding at the live resolution', () => {
    const random = seededRandom(4200)
    const scenarios: { image: ImageLike; template: FrameTemplate }[] = Array.from({ length: 10 }, (_, index) =>
      realisticShot(random, randomCubeState(random), firstShotPose, index, 720),
    )
    let pristineDetected = 0
    let videoDetected = 0
    let dimVideoDetected = 0
    for (const { image, template } of scenarios) {
      const size = liveAnalysisSize(image)
      expect(size).toEqual({ width: image.width, height: image.height })
      if (detectShot(image, template).detected) pristineDetected++
      if (detectShot(videoRoundTrip(image), template).detected) videoDetected++
      if (detectShot(videoRoundTrip(image, 0.8), template).detected) dimVideoDetected++
    }
    expect(pristineDetected).toBeGreaterThanOrEqual(9)
    expect(videoDetected).toBeGreaterThanOrEqual(pristineDetected - 1)
    expect(dimVideoDetected).toBeGreaterThanOrEqual(pristineDetected - 1)
  })
})
