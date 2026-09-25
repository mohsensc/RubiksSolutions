import { describe, expect, it } from 'vitest'
import { coverVisibleRect, fitTemplate, gridLines, hexagonBounds, hexagonCenter, scaleTemplate, translateTemplate } from './templateFit'

const width = 1000
const height = 750

describe('templateFit', () => {
  it('fits the hexagon inside the target rectangle, centered', () => {
    const target = { x: 100, y: 50, width: 400, height: 300 }
    const template = fitTemplate(width, height, target, 0.9)
    const bounds = hexagonBounds(template, width, height)
    const [centerX, centerY] = hexagonCenter(template, width, height)
    expect(centerX).toBeCloseTo(300, 3)
    expect(centerY).toBeCloseTo(200, 3)
    expect(Math.max(bounds.width / target.width, bounds.height / target.height)).toBeCloseTo(0.9, 3)
  })

  it('translates by pixel deltas', () => {
    const template = fitTemplate(width, height, { x: 0, y: 0, width, height }, 0.7)
    const [startX, startY] = hexagonCenter(template, width, height)
    const moved = translateTemplate(template, 40, -25, width, height)
    const [endX, endY] = hexagonCenter(moved, width, height)
    expect(endX - startX).toBeCloseTo(40, 3)
    expect(endY - startY).toBeCloseTo(-25, 3)
  })

  it('scales around the hexagon center within limits', () => {
    const template = fitTemplate(width, height, { x: 0, y: 0, width, height }, 0.5)
    const center = hexagonCenter(template, width, height)
    const bigger = scaleTemplate(template, 1.2, width, height)
    expect(hexagonBounds(bigger, width, height).height / hexagonBounds(template, width, height).height).toBeCloseTo(1.2, 3)
    expect(hexagonCenter(bigger, width, height)[0]).toBeCloseTo(center[0], 3)
    const tiny = scaleTemplate(template, 0.01, width, height)
    expect(hexagonBounds(tiny, width, height).height).toBeGreaterThan(0.2 * height)
  })

  it('maps screen rectangles into a covered frame', () => {
    const { toFrame } = coverVisibleRect(720, 1280, 390, 844)
    const visible = toFrame({ x: 0, y: 0, width: 390, height: 844 })
    expect(visible.height).toBeCloseTo(1280, 1)
    expect(visible.x + visible.width / 2).toBeCloseTo(360, 1)
  })

  it('builds interior grid lines', () => {
    const square: [number, number][] = [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
    ]
    expect(gridLines(square)).toHaveLength(4)
    expect(gridLines(square)[0]).toEqual([
      [1, 0],
      [1, 3],
    ])
  })
})
