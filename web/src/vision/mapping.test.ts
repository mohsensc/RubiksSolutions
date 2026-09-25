import { describe, expect, it } from 'vitest'
import { faceletPlacements } from '../cube/geometry'
import { solvedFacelets } from '../cube/facelets'
import { applyMoves } from '../cube/moves'
import { generateScramble } from '../cube/scramble'
import { minimumCostAssignment } from './assignment'
import { cubeConsistency } from './cubeValidity'
import {
  firstShotFacelets,
  firstShotOrientation,
  photoFaceletIndices,
  secondShotFaceletVariants,
  secondShotOrientations,
} from './faceletMapping'
import { defaultTemplate, templateGeometry } from './template'
import { stableDetectionTracker } from './tracker'
import { photoFaces, type ShotDetection } from './types'
import { seededRandom } from './__fixtures__/syntheticPhoto'

const identityCells = Array.from({ length: 9 }, (_, cell) => cell)

function sameCubie(first: number, second: number): boolean {
  return faceletPlacements[first].cubie.every((value, axis) => value === faceletPlacements[second].cubie[axis])
}

describe('photo face to facelet mapping', () => {
  it('reads shot one faces straight into U, F and R', () => {
    expect(firstShotOrientation).toEqual({ top: 'U', left: 'F', right: 'R' })
    expect(firstShotFacelets.top).toEqual(identityCells.map((cell) => cell))
    expect(firstShotFacelets.left).toEqual(identityCells.map((cell) => 18 + cell))
    expect(firstShotFacelets.right).toEqual(identityCells.map((cell) => 9 + cell))
  })

  it('reads the flipped cube with D on top as derived by hand', () => {
    const variant = secondShotFaceletVariants[0]
    expect(secondShotOrientations[0]).toEqual({ top: 'D', left: 'L', right: 'B' })
    expect(variant.top).toEqual(identityCells.map((cell) => 27 + (cell % 3) * 3 + (2 - Math.floor(cell / 3))))
    expect(variant.left).toEqual(identityCells.map((cell) => 44 - cell))
    expect(variant.right).toEqual(identityCells.map((cell) => 53 - cell))
  })

  it('covers all 54 facelets exactly once for every second shot rotation', () => {
    for (const variant of secondShotFaceletVariants) {
      const indices = [...photoFaces.flatMap((face) => firstShotFacelets[face]), ...photoFaces.flatMap((face) => variant[face])]
      expect(new Set(indices).size).toBe(54)
    }
  })

  it('puts the corner cubie at the hexagon center and keeps seams on shared cubies', () => {
    for (const table of [firstShotFacelets, ...secondShotFaceletVariants]) {
      expect(sameCubie(table.top[8], table.left[2])).toBe(true)
      expect(sameCubie(table.top[8], table.right[0])).toBe(true)
      for (let step = 0; step < 3; step++) {
        expect(sameCubie(table.top[6 + step], table.left[step])).toBe(true)
        expect(sameCubie(table.top[8 - 3 * step], table.right[step])).toBe(true)
        expect(sameCubie(table.left[2 + 3 * step], table.right[3 * step])).toBe(true)
      }
    }
  })

  it('rejects mirrored corner views', () => {
    expect(() => photoFaceletIndices({ top: 'U', left: 'R', right: 'F' })).toThrow()
  })
})

describe('frame template geometry', () => {
  it('centers a hexagon of the requested radius', () => {
    const template = defaultTemplate(400, 400)
    const geometry = templateGeometry(template, 400, 400)
    expect(geometry.hexagon).toHaveLength(6)
    const [topVertex] = geometry.hexagon
    expect(topVertex[0]).toBeCloseTo(200, 5)
    expect(topVertex[1]).toBeLessThan(200 - template.size * 400 * 0.8)
    for (const face of photoFaces) {
      expect(geometry.faces[face].cellCenters).toHaveLength(9)
      expect(geometry.faces[face].polygon).toHaveLength(4)
    }
    expect(geometry.faces.left.cellCenters[4][0]).toBeLessThan(200)
    expect(geometry.faces.right.cellCenters[4][0]).toBeGreaterThan(200)
    expect(geometry.faces.top.cellCenters[4][1]).toBeLessThan(200)
  })

  it('rotates the template around its center', () => {
    const straight = templateGeometry({ centerX: 0.5, centerY: 0.5, size: 0.3 }, 300, 300)
    const turned = templateGeometry({ centerX: 0.5, centerY: 0.5, size: 0.3, rotation: (2 * Math.PI) / 3 }, 300, 300)
    const [x, y] = turned.hexagon[0]
    expect(x).toBeCloseTo(straight.hexagon[2][0], 6)
    expect(y).toBeCloseTo(straight.hexagon[2][1], 6)
    expect(turned.faces.top.cellCenters[4][0]).toBeCloseTo(straight.faces.right.cellCenters[4][0], 6)
  })
})

describe('cube consistency', () => {
  it('accepts solved and scrambled cubes', () => {
    const random = seededRandom(3)
    expect(cubeConsistency(solvedFacelets).isValid).toBe(true)
    for (let round = 0; round < 20; round++) {
      expect(cubeConsistency(applyMoves(solvedFacelets, generateScramble(25, random))).isValid).toBe(true)
    }
  })

  it('rejects swapped stickers, flipped edges and twisted corners', () => {
    const swap = (facelets: string, first: number, second: number) => {
      const chars = facelets.split('')
      ;[chars[first], chars[second]] = [chars[second], chars[first]]
      return chars.join('')
    }
    expect(cubeConsistency(swap(solvedFacelets, 1, 10)).isValid).toBe(false)
    expect(cubeConsistency(swap(solvedFacelets, 7, 19)).isValid).toBe(false)
    const twisted = solvedFacelets.split('')
    ;[twisted[8], twisted[9], twisted[20]] = [twisted[20], twisted[8], twisted[9]]
    expect(cubeConsistency(twisted.join('')).isValid).toBe(false)
  })
})

describe('minimum cost assignment', () => {
  it('finds the optimal matching', () => {
    const assignment = minimumCostAssignment([
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ])
    expect(assignment).toEqual([1, 0, 2])
  })
})

describe('stable detection tracker', () => {
  const detection = (detected: boolean) => ({ detected }) as ShotDetection

  it('turns ready after the required time and resets on loss', () => {
    const tracker = stableDetectionTracker(500)
    for (let time = 0; time < 500; time += 100) expect(tracker.update(detection(true), time)).toBe(false)
    expect(tracker.update(detection(true), 500)).toBe(true)
    expect(tracker.update(detection(false), 600)).toBe(false)
    expect(tracker.update(detection(true), 700)).toBe(true)
    expect(tracker.update(detection(false), 800)).toBe(false)
    expect(tracker.update(detection(false), 900)).toBe(false)
    expect(tracker.update(detection(true), 1000)).toBe(false)
    tracker.reset()
    expect(tracker.update(detection(true), 1200)).toBe(false)
  })

  it('never counts dropped frames toward the stable window', () => {
    const tracker = stableDetectionTracker(500)
    const results: boolean[] = []
    for (let time = 0; time <= 800; time += 100) results.push(tracker.update(detection(time % 200 === 0), time))
    expect(results.every((isReady) => !isReady)).toBe(true)
  })

  it('stays off while the cube only flickers into view', () => {
    const tracker = stableDetectionTracker(500)
    for (let time = 0; time < 6000; time += 100) {
      const isVisible = Math.floor(time / 400) % 2 === 0
      expect(tracker.update(detection(isVisible), time)).toBe(false)
    }
  })
})
