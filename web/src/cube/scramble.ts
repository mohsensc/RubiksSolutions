import { faceOrder, type Face } from './facelets'
import { faceLayer } from './geometry'
import { moveSuffixes, type Move } from './moves'

export function generateScramble(length: number, random: () => number = Math.random): Move[] {
  const scramble: Move[] = []
  const faces: Face[] = []
  while (scramble.length < length) {
    const face = faceOrder[Math.floor(random() * faceOrder.length)]
    const previousFace = faces[faces.length - 1]
    const faceBeforePrevious = faces[faces.length - 2]
    if (face === previousFace) continue
    const sharesAxisWithPrevious = previousFace !== undefined && faceLayer[previousFace].axis === faceLayer[face].axis
    if (sharesAxisWithPrevious && face === faceBeforePrevious) continue
    const suffix = moveSuffixes[Math.floor(random() * moveSuffixes.length)]
    faces.push(face)
    scramble.push(`${face}${suffix}` as Move)
  }
  return scramble
}
