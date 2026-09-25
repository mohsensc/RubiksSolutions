import { describe, expect, it } from 'vitest'
import { detectShot } from '../../vision'
import { firstShotPose, randomCubeState, realisticShot, secondShotPoses } from '../../vision/__fixtures__/photoScenarios'
import { axisRotation, cubeTurnY, multiplyMatrices, roundedMatrix, seededRandom, type Matrix3 } from '../../vision/__fixtures__/syntheticPhoto'
import { captureShot, isSameSideAs, type CapturedShot } from './capturedShot'

const cornerTurn = roundedMatrix(axisRotation([1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], (2 * Math.PI) / 3))

function detectedShot(random: () => number, facelets: string, pose: Matrix3, seed: number) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { image, template } = realisticShot(random, facelets, pose, seed * 10 + attempt)
    const detection = detectShot(image, template)
    if (detection.detected) return detection
  }
  throw new Error('shot not detected')
}

describe('second shot guard', () => {
  const random = seededRandom(2718)
  const rounds = Array.from({ length: 5 }, (_, round) => {
    const facelets = randomCubeState(random)
    const first: CapturedShot = captureShot(detectedShot(random, facelets, firstShotPose, round))
    return { facelets, first, round }
  })

  it('accepts the opposite corner in every hand rotation', () => {
    for (const { facelets, first, round } of rounds) {
      secondShotPoses.forEach((pose, variant) => {
        expect(isSameSideAs(first, detectedShot(random, facelets, pose, 100 + round * 3 + variant))).toBe(false)
      })
    }
  })

  it('rejects the same corner shown again, turned around its diagonal', () => {
    for (const { facelets, first, round } of rounds) {
      expect(isSameSideAs(first, detectedShot(random, facelets, firstShotPose, 200 + round))).toBe(true)
      expect(isSameSideAs(first, detectedShot(random, facelets, cornerTurn, 300 + round))).toBe(true)
      expect(isSameSideAs(first, detectedShot(random, facelets, multiplyMatrices(cornerTurn, cornerTurn), 400 + round))).toBe(true)
    }
  })

  it('rejects a corner that shares a face with the first shot', () => {
    for (const { facelets, first, round } of rounds) {
      expect(isSameSideAs(first, detectedShot(random, facelets, cubeTurnY, 500 + round))).toBe(true)
    }
  })
})
