import type { ImageLike } from './types'

export interface IntegralImage {
  width: number
  height: number
  sums: Uint32Array
}

export function buildIntegralImage(image: ImageLike): IntegralImage {
  const { width, height, data } = image
  const stride = width + 1
  const sums = new Uint32Array(stride * (height + 1) * 3)
  for (let y = 0; y < height; y++) {
    let rowRed = 0
    let rowGreen = 0
    let rowBlue = 0
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4
      rowRed += data[source]
      rowGreen += data[source + 1]
      rowBlue += data[source + 2]
      const target = ((y + 1) * stride + x + 1) * 3
      const above = (y * stride + x + 1) * 3
      sums[target] = sums[above] + rowRed
      sums[target + 1] = sums[above + 1] + rowGreen
      sums[target + 2] = sums[above + 2] + rowBlue
    }
  }
  return { width, height, sums }
}

export function boxMean(integral: IntegralImage, x: number, y: number, radius: number, target: Float32Array, slot: number): number {
  const { width, height, sums } = integral
  const stride = width + 1
  let left = (x - radius + 0.5) | 0
  if (left < 0) left = 0
  else if (left > width - 1) left = width - 1
  let right = ((x + radius + 0.5) | 0) + 1
  if (right > width) right = width
  if (right <= left) right = left + 1
  let top = (y - radius + 0.5) | 0
  if (top < 0) top = 0
  else if (top > height - 1) top = height - 1
  let bottom = ((y + radius + 0.5) | 0) + 1
  if (bottom > height) bottom = height
  if (bottom <= top) bottom = top + 1
  const inverseArea = 1 / ((right - left) * (bottom - top))
  const topLeft = (top * stride + left) * 3
  const topRight = (top * stride + right) * 3
  const bottomLeft = (bottom * stride + left) * 3
  const bottomRight = (bottom * stride + right) * 3
  const red = (sums[bottomRight] - sums[topRight] - sums[bottomLeft] + sums[topLeft]) * inverseArea
  const green = (sums[bottomRight + 1] - sums[topRight + 1] - sums[bottomLeft + 1] + sums[topLeft + 1]) * inverseArea
  const blue = (sums[bottomRight + 2] - sums[topRight + 2] - sums[bottomLeft + 2] + sums[topLeft + 2]) * inverseArea
  const offset = slot * 3
  target[offset] = red
  target[offset + 1] = green
  target[offset + 2] = blue
  return red + green + blue
}

export function downsampleImage(image: ImageLike, maximumShorterSide: number): { image: ImageLike; factor: number } {
  const shorterSide = Math.min(image.width, image.height)
  const factor = Math.floor(shorterSide / maximumShorterSide)
  if (factor < 2) return { image, factor: 1 }
  const width = Math.floor(image.width / factor)
  const height = Math.floor(image.height / factor)
  const data = new Uint8ClampedArray(width * height * 4)
  const area = factor * factor
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let red = 0
      let green = 0
      let blue = 0
      for (let dy = 0; dy < factor; dy++) {
        let source = ((y * factor + dy) * image.width + x * factor) * 4
        for (let dx = 0; dx < factor; dx++) {
          red += image.data[source]
          green += image.data[source + 1]
          blue += image.data[source + 2]
          source += 4
        }
      }
      const target = (y * width + x) * 4
      data[target] = red / area
      data[target + 1] = green / area
      data[target + 2] = blue / area
      data[target + 3] = 255
    }
  }
  return { image: { width, height, data }, factor }
}
