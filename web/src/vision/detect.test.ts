import { describe, expect, it } from 'vitest'
import type { Face } from '../cube/facelets'
import { assembleCube } from './assemble'
import { labFromRgb, stickerCssColor, westernFaceOfColor, stickerColors, type StickerColor } from './color'
import { cubeConsistency } from './cubeValidity'
import { detectShot } from './detect'
import { firstShotFacelets, secondShotFaceletVariants } from './faceletMapping'
import { templateGeometry } from './template'
import { photoFaces, type PhotoFace, type Rgb, type ShotDetection, type StickerSample } from './types'
import {
  firstShotPose,
  negativeKinds,
  negativeShot,
  randomCubeState,
  realisticShot,
  secondShotPoses,
} from './__fixtures__/photoScenarios'
import { cameraStickerColors, defaultScene, renderScene, seededRandom, type Matrix3 } from './__fixtures__/syntheticPhoto'

const colorOfFace = Object.fromEntries(stickerColors.map((color) => [westernFaceOfColor[color], color])) as Record<Face, StickerColor>

function nearestFace(rgb: Rgb): Face {
  let best: Face = 'U'
  let bestDistance = Infinity
  for (const [face, color] of Object.entries(cameraStickerColors) as [Face, Rgb][]) {
    const distance = Math.hypot(rgb[0] - color[0], rgb[1] - color[1], rgb[2] - color[2])
    if (distance < bestDistance) {
      bestDistance = distance
      best = face
    }
  }
  return best
}

const poses: { pose: Matrix3; table: Record<PhotoFace, number[]> }[] = [
  { pose: firstShotPose, table: firstShotFacelets },
  ...secondShotPoses.map((pose, variant) => ({ pose, table: secondShotFaceletVariants[variant] })),
]

describe('rendered cube photos prove the facelet mapping', () => {
  it('reads every template cell of an ideal render as its mapped facelet', () => {
    const random = seededRandom(11)
    for (let round = 0; round < 4; round++) {
      const facelets = randomCubeState(random)
      for (const { pose, table } of poses) {
        const { image, template } = renderScene(
          defaultScene({ facelets, cubeToWorld: pose, cameraDistance: 8.5, faceShading: [1, 1, 1], width: 240, height: 240 }),
        )
        const geometry = templateGeometry(template, image.width, image.height)
        for (const photoFace of photoFaces) {
          geometry.faces[photoFace].cellCenters.forEach(([x, y], cell) => {
            const offset = (Math.round(y) * image.width + Math.round(x)) * 4
            const rgb: Rgb = [image.data[offset], image.data[offset + 1], image.data[offset + 2]]
            expect(nearestFace(rgb)).toBe(facelets[table[photoFace][cell]])
          })
        }
      }
    }
  })
})

describe('detectShot', () => {
  it('detects a clean corner view and previews the right colors', () => {
    const facelets = randomCubeState(seededRandom(5))
    const { image, template } = renderScene(defaultScene({ facelets, background: 'clutter' }))
    const detection = detectShot(image, template)
    expect(detection.detected).toBe(true)
    expect(detection.confidence).toBeGreaterThan(0.7)
    for (const photoFace of photoFaces) {
      detection.previewColors[photoFace].forEach((color, cell) => {
        expect(color).toBe(stickerCssColor[colorOfFace[facelets[firstShotFacelets[photoFace][cell]] as Face]])
      })
    }
  })

  it('reads misaligned, tilted, badly lit photos accurately', () => {
    const random = seededRandom(2024)
    let detected = 0
    let correct = 0
    let total = 0
    const shots = 16
    for (let index = 0; index < shots; index++) {
      const facelets = randomCubeState(random)
      const variant = index % 4
      const { image, template } = realisticShot(random, facelets, poses[variant].pose, index)
      const detection = detectShot(image, template)
      if (!detection.detected) continue
      detected++
      for (const photoFace of photoFaces) {
        detection.previewColors[photoFace].forEach((color, cell) => {
          total++
          if (color === stickerCssColor[colorOfFace[facelets[poses[variant].table[photoFace][cell]] as Face]]) correct++
        })
      }
    }
    expect(detected).toBeGreaterThanOrEqual(15)
    expect(correct / total).toBeGreaterThanOrEqual(0.98)
  })

  it('corrects or rejects a grid shifted by a whole sticker', () => {
    const random = seededRandom(31)
    let detected = 0
    const shots = 12
    for (let index = 0; index < shots; index++) {
      const facelets = randomCubeState(random)
      const variant = index % 4
      const { image, template } = realisticShot(random, facelets, poses[variant].pose, index)
      const angle = random() * Math.PI * 2
      const radiusPixels = template.size * Math.min(image.width, image.height)
      const shifted = {
        ...template,
        centerX: template.centerX + (Math.cos(angle) * radiusPixels * 0.33) / image.width,
        centerY: template.centerY + (Math.sin(angle) * radiusPixels * 0.33) / image.height,
      }
      const detection = detectShot(image, shifted)
      if (!detection.detected) continue
      detected++
      let correct = 0
      for (const photoFace of photoFaces) {
        detection.previewColors[photoFace].forEach((color, cell) => {
          if (color === stickerCssColor[colorOfFace[facelets[poses[variant].table[photoFace][cell]] as Face]]) correct++
        })
      }
      expect(correct, `shot ${index}`).toBeGreaterThanOrEqual(24)
    }
    expect(detected).toBeGreaterThanOrEqual(shots / 3)
  })

  it('never detects a cube in negative images', () => {
    for (const kind of negativeKinds) {
      for (let seed = 0; seed < 3; seed++) {
        const { image, template } = negativeShot(kind, 500 + seed * 17)
        const detection = detectShot(image, template)
        expect(detection.detected, `${kind} ${seed}`).toBe(false)
      }
    }
  })

  it('says why a blank frame is rejected', () => {
    const { image, template } = negativeShot('wall', 3)
    const detection = detectShot(image, template)
    expect(detection.detected).toBe(false)
    expect(detection.reason).toBeDefined()
    expect(detection.confidence).toBeLessThan(0.7)
  })

  it('downsamples large photos and reports sample points in source pixels', () => {
    const facelets = randomCubeState(seededRandom(8))
    const { image, template } = renderScene(defaultScene({ facelets, width: 900, height: 900 }))
    const detection = detectShot(image, template)
    expect(detection.detected).toBe(true)
    const [x, y] = detection.samplePoints.left[4]
    const expected = templateGeometry(template, 900, 900).faces.left.cellCenters[4]
    expect(Math.hypot(x - expected[0], y - expected[1])).toBeLessThan(30)
  })

  it('runs fast on a 320 pixel frame', () => {
    const random = seededRandom(77)
    const scenarios = Array.from({ length: 6 }, (_, index) => realisticShot(random, randomCubeState(random), firstShotPose, index))
    detectShot(scenarios[0].image, scenarios[0].template)
    const start = performance.now()
    for (const { image, template } of scenarios) detectShot(image, template)
    expect((performance.now() - start) / scenarios.length).toBeLessThan(25)
  })
})

function syntheticDetection(facelets: string, table: Record<PhotoFace, number[]>, random: () => number, gain: number): ShotDetection {
  const faces = Object.fromEntries(
    photoFaces.map((photoFace) => [
      photoFace,
      table[photoFace].map((index): StickerSample => {
        const base = cameraStickerColors[facelets[index] as Face]
        const rgb = base.map((value) => Math.max(0, Math.min(255, Math.round(value * gain + (random() - 0.5) * 16)))) as Rgb
        return { rgb, lab: labFromRgb(rgb), variance: 4 }
      }),
    ]),
  ) as Record<PhotoFace, StickerSample[]>
  const previewColors = Object.fromEntries(photoFaces.map((photoFace) => [photoFace, faces[photoFace].map(() => '#000')])) as Record<
    PhotoFace,
    string[]
  >
  return {
    detected: true,
    confidence: 1,
    faces,
    previewColors,
    alignedTemplate: { centerX: 0.5, centerY: 0.5, size: 0.34 },
    samplePoints: Object.fromEntries(photoFaces.map((photoFace) => [photoFace, []])) as unknown as Record<PhotoFace, [number, number][]>,
  }
}

describe('assembleCube', () => {
  it('recovers the exact state for every way the cube is turned over', () => {
    const random = seededRandom(99)
    for (let round = 0; round < 30; round++) {
      const facelets = randomCubeState(random)
      const variant = round % 3
      const first = syntheticDetection(facelets, firstShotFacelets, random, 0.8 + random() * 0.4)
      const second = syntheticDetection(facelets, secondShotFaceletVariants[variant], random, 0.6 + random() * 0.6)
      const assembled = assembleCube(first, second)
      expect(assembled.candidates).toHaveLength(3)
      expect(assembled.facelets).toBe(facelets)
      expect(cubeConsistency(assembled.facelets).isValid).toBe(true)
    }
  })

  it('recovers the state when glare washes out a center sticker', () => {
    const random = seededRandom(123)
    for (let round = 0; round < 12; round++) {
      const facelets = randomCubeState(random)
      const variant = round % 3
      const first = syntheticDetection(facelets, firstShotFacelets, random, 1)
      const second = syntheticDetection(facelets, secondShotFaceletVariants[variant], random, 1)
      const glared = photoFaces[round % 3]
      const washed = first.faces[glared][4].rgb.map((value) => Math.round(value * 0.45 + 255 * 0.55)) as Rgb
      first.faces[glared][4] = { rgb: washed, lab: labFromRgb(washed), variance: 4 }
      const assembled = assembleCube(first, second)
      expect(assembled.candidates.find((candidate) => cubeConsistency(candidate).isValid)).toBe(facelets)
    }
  })

  it('recovers states from rendered photo pairs', () => {
    const random = seededRandom(404)
    let recovered = 0
    let attempted = 0
    for (let round = 0; round < 8; round++) {
      const facelets = randomCubeState(random)
      const variant = round % 3
      const first = realisticShot(random, facelets, firstShotPose, round * 2)
      const second = realisticShot(random, facelets, secondShotPoses[variant], round * 2 + 1)
      const firstDetection = detectShot(first.image, first.template)
      const secondDetection = detectShot(second.image, second.template)
      if (!firstDetection.detected || !secondDetection.detected) continue
      attempted++
      const assembled = assembleCube(firstDetection, secondDetection)
      const valid = assembled.candidates.find((candidate) => cubeConsistency(candidate).isValid)
      if (valid === facelets) recovered++
    }
    expect(attempted).toBeGreaterThanOrEqual(7)
    expect(recovered).toBe(attempted)
  })
})
