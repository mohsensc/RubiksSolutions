import type { CornerPoint, Point } from './types'

export type PlaneHomography = Float64Array

export function planeHomography(project: (point: CornerPoint) => Point, surface: (row: number, column: number) => CornerPoint, span = 3): PlaneHomography {
  const [x0, y0] = project(surface(0, 0))
  const [x1, y1] = project(surface(0, span))
  const [x2, y2] = project(surface(span, span))
  const [x3, y3] = project(surface(span, 0))
  const sumX = x0 - x1 + x2 - x3
  const sumY = y0 - y1 + y2 - y3
  const deltaX1 = x1 - x2
  const deltaX2 = x3 - x2
  const deltaY1 = y1 - y2
  const deltaY2 = y3 - y2
  const denominator = deltaX1 * deltaY2 - deltaX2 * deltaY1 || 1e-12
  const g = (sumX * deltaY2 - deltaX2 * sumY) / denominator
  const h = (deltaX1 * sumY - sumX * deltaY1) / denominator
  return Float64Array.of(
    (x1 - x0 + g * x1) / span,
    (x3 - x0 + h * x3) / span,
    x0,
    (y1 - y0 + g * y1) / span,
    (y3 - y0 + h * y3) / span,
    y0,
    g / span,
    h / span,
  )
}

export function applyHomography(homography: PlaneHomography, row: number, column: number): Point {
  const weight = homography[6] * column + homography[7] * row + 1
  return [
    (homography[0] * column + homography[1] * row + homography[2]) / weight,
    (homography[3] * column + homography[4] * row + homography[5]) / weight,
  ]
}
