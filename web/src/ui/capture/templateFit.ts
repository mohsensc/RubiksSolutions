import { defaultTemplate, templateGeometry, type FrameTemplate, type Point } from '../../vision'

export { photoFaces } from '../../vision'
export type { Point } from '../../vision'

export interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

export function hexagonBounds(template: FrameTemplate, width: number, height: number): FrameRect {
  const { hexagon } = templateGeometry(template, width, height)
  const xs = hexagon.map(([x]) => x)
  const ys = hexagon.map(([, y]) => y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

export function hexagonCenter(template: FrameTemplate, width: number, height: number): Point {
  const bounds = hexagonBounds(template, width, height)
  return [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2]
}

export function translateTemplate(template: FrameTemplate, deltaX: number, deltaY: number, width: number, height: number): FrameTemplate {
  const [originX, originY] = hexagonCenter(template, width, height)
  const [shiftedX] = hexagonCenter({ ...template, centerX: template.centerX + 1 }, width, height)
  const [, shiftedY] = hexagonCenter({ ...template, centerY: template.centerY + 1 }, width, height)
  const pixelsPerUnitX = shiftedX - originX || 1
  const pixelsPerUnitY = shiftedY - originY || 1
  return { ...template, centerX: template.centerX + deltaX / pixelsPerUnitX, centerY: template.centerY + deltaY / pixelsPerUnitY }
}

export function moveTemplateCenterTo(template: FrameTemplate, target: Point, width: number, height: number): FrameTemplate {
  const [currentX, currentY] = hexagonCenter(template, width, height)
  return translateTemplate(template, target[0] - currentX, target[1] - currentY, width, height)
}

export function scaleTemplate(template: FrameTemplate, factor: number, width: number, height: number, limits = { min: 0.12, max: 0.62 }): FrameTemplate {
  const center = hexagonCenter(template, width, height)
  const shorterSide = Math.min(width, height)
  const bounds = hexagonBounds(template, width, height)
  const currentShare = bounds.height / shorterSide
  const nextShare = Math.min(limits.max * 2, Math.max(limits.min * 2, currentShare * factor))
  const appliedFactor = currentShare > 0 ? nextShare / currentShare : factor
  return moveTemplateCenterTo({ ...template, size: template.size * appliedFactor }, center, width, height)
}

export function fitTemplate(width: number, height: number, target: FrameRect, fill: number): FrameTemplate {
  const base = defaultTemplate(width, height)
  const bounds = hexagonBounds(base, width, height)
  const factor = fill * Math.min(target.width / bounds.width, target.height / bounds.height)
  const scaled = { ...base, size: base.size * factor }
  return moveTemplateCenterTo(scaled, [target.x + target.width / 2, target.y + target.height / 2], width, height)
}

export function coverVisibleRect(frameWidth: number, frameHeight: number, viewWidth: number, viewHeight: number) {
  const scale = Math.max(viewWidth / frameWidth, viewHeight / frameHeight)
  const offsetX = (viewWidth - frameWidth * scale) / 2
  const offsetY = (viewHeight - frameHeight * scale) / 2
  return {
    scale,
    toFrame: (rect: FrameRect): FrameRect => ({
      x: (rect.x - offsetX) / scale,
      y: (rect.y - offsetY) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    }),
  }
}

export function gridLines(polygon: Point[]): Array<[Point, Point]> {
  const [first, second, third, fourth] = polygon
  const lerp = (from: Point, to: Point, amount: number): Point => [from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount]
  return [1 / 3, 2 / 3].flatMap((amount) => [
    [lerp(first, second, amount), lerp(fourth, third, amount)] as [Point, Point],
    [lerp(first, fourth, amount), lerp(second, third, amount)] as [Point, Point],
  ])
}

export function polygonPath(points: Point[]): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + ' Z'
}
