import { labFromLinear, lightnessFromLinearLuminance, linearChannel } from './color'
import type { ImageLike, Lab, Point, Rgb, StickerSample } from './types'

const maximumSamplesPerAxis = 7
const darkPatchBrightness = 150
const darkPatchPenalty = 12
const snapDistancePenalty = 30

const patchCapacity = maximumSamplesPerAxis * maximumSamplesPerAxis
const patchChannels = Array.from({ length: 6 }, () => new Float64Array(patchCapacity))

function median(values: Float64Array, count: number): number {
  const sorted = values.subarray(0, count).sort()
  const middle = count >> 1
  return count % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function clampIndex(value: number, limit: number): number {
  return value < 0 ? 0 : value >= limit ? limit - 1 : value
}

function pixelOffset(image: ImageLike, x: number, y: number): number {
  return (clampIndex(Math.round(y), image.height) * image.width + clampIndex(Math.round(x), image.width)) * 4
}

export function samplePatch(image: ImageLike, center: Point, halfSize: number): StickerSample {
  const span = Math.max(1, halfSize)
  const steps = Math.min(maximumSamplesPerAxis, Math.max(3, Math.round(span * 2) + 1))
  const [lightness, greenRed, blueYellow, reds, greens, blues] = patchChannels
  let count = 0
  let sum = 0
  let sumOfSquares = 0
  const channelSums: Lab = [0, 0, 0]
  for (let row = 0; row < steps; row++) {
    for (let column = 0; column < steps; column++) {
      const x = center[0] - span + (2 * span * column) / (steps - 1)
      const y = center[1] - span + (2 * span * row) / (steps - 1)
      const offset = pixelOffset(image, x, y)
      const red = image.data[offset]
      const green = image.data[offset + 1]
      const blue = image.data[offset + 2]
      const lab = labFromLinear(linearChannel(red), linearChannel(green), linearChannel(blue))
      channelSums[0] += lab[0]
      channelSums[1] += lab[1]
      channelSums[2] += lab[2]
      sumOfSquares += lab[0] * lab[0] + lab[1] * lab[1] + lab[2] * lab[2]
      lightness[count] = lab[0]
      greenRed[count] = lab[1]
      blueYellow[count] = lab[2]
      reds[count] = red
      greens[count] = green
      blues[count] = blue
      count++
    }
  }
  const lab: Lab = [median(lightness, count), median(greenRed, count), median(blueYellow, count)]
  const rgb: Rgb = [median(reds, count), median(greens, count), median(blues, count)]
  for (let channel = 0; channel < 3; channel++) sum += lab[channel] * (count * lab[channel] - 2 * channelSums[channel])
  return { lab, rgb, variance: Math.max(0, (sumOfSquares + sum) / count) }
}

export function lightnessAt(image: ImageLike, x: number, y: number): number {
  const left = clampIndex(Math.floor(x), image.width)
  const top = clampIndex(Math.floor(y), image.height)
  const right = clampIndex(left + 1, image.width)
  const bottom = clampIndex(top + 1, image.height)
  let luminance = 0
  for (const [pixelX, pixelY] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ]) {
    const offset = (pixelY * image.width + pixelX) * 4
    luminance +=
      0.2126729 * linearChannel(image.data[offset]) +
      0.7151522 * linearChannel(image.data[offset + 1]) +
      0.072175 * linearChannel(image.data[offset + 2])
  }
  return lightnessFromLinearLuminance(luminance / 4)
}

export function darkestAlongSegment(image: ImageLike, from: Point, to: Point, startFraction: number, endFraction: number): number {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const steps = Math.max(4, Math.ceil(length * (endFraction - startFraction) * 1.5))
  let darkest = Infinity
  for (let step = 0; step <= steps; step++) {
    const fraction = startFraction + ((endFraction - startFraction) * step) / steps
    const value = lightnessAt(image, from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction)
    if (value < darkest) darkest = value
  }
  return darkest
}

function patchSpread(image: ImageLike, center: Point, halfSize: number): number {
  let sumRed = 0
  let sumGreen = 0
  let sumBlue = 0
  let sumSquares = 0
  let minimumBrightness = Infinity
  let count = 0
  for (let row = -1; row <= 1; row++) {
    for (let column = -1; column <= 1; column++) {
      const offset = pixelOffset(image, center[0] + column * halfSize, center[1] + row * halfSize)
      const red = image.data[offset]
      const green = image.data[offset + 1]
      const blue = image.data[offset + 2]
      sumRed += red
      sumGreen += green
      sumBlue += blue
      sumSquares += red * red + green * green + blue * blue
      minimumBrightness = Math.min(minimumBrightness, red + green + blue)
      count++
    }
  }
  const meanSquares = (sumRed * sumRed + sumGreen * sumGreen + sumBlue * sumBlue) / (count * count)
  return sumSquares / count - meanSquares + Math.max(0, darkPatchBrightness - minimumBrightness) * darkPatchPenalty
}

export function snapToSticker(image: ImageLike, center: Point, searchRadius: number, halfSize: number): Point {
  let best = center
  let bestSpread = patchSpread(image, center, halfSize)
  for (let row = -2; row <= 2; row++) {
    for (let column = -2; column <= 2; column++) {
      if (row === 0 && column === 0) continue
      const candidate: Point = [center[0] + (column * searchRadius) / 2, center[1] + (row * searchRadius) / 2]
      const spread = patchSpread(image, candidate, halfSize) + (row * row + column * column) * snapDistancePenalty
      if (spread < bestSpread) {
        bestSpread = spread
        best = candidate
      }
    }
  }
  return best
}
