import { engine, EngineError } from '../../engine/engineClient'
import { assembleCube, cubeConsistency } from '../../vision'
import type { CapturedShot } from './capturedShot'

export type AssemblyOutcome = { kind: 'valid'; facelets: string } | { kind: 'needsFixing'; facelets: string }

export async function assembleCapturedCube(firstShot: CapturedShot, secondShot: CapturedShot): Promise<AssemblyOutcome> {
  const { facelets, candidates } = assembleCube(firstShot.detection, secondShot.detection)
  const orderedCandidates = [...new Set([...candidates, facelets])]
  for (const candidate of orderedCandidates) {
    try {
      await engine.validate(candidate)
      return { kind: 'valid', facelets: candidate }
    } catch (error) {
      if (error instanceof EngineError && error.unavailable) {
        const locallyValid = orderedCandidates.find((option) => cubeConsistency(option).isValid)
        return locallyValid ? { kind: 'valid', facelets: locallyValid } : { kind: 'needsFixing', facelets: orderedCandidates[0] }
      }
    }
  }
  return { kind: 'needsFixing', facelets: orderedCandidates[0] }
}
