import { describe, expect, it } from 'vitest'
import { isSolved, solvedFacelets } from './facelets'
import { allMoves, applyMove, applyMoves, invertSequence, type Move } from './moves'
import { generateScramble } from './scramble'

describe('cube moves', () => {
  it('turns R on a solved cube like the engine', () => {
    expect(applyMove(solvedFacelets, 'R')).toBe('UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB')
  })

  it('turns U, F, D, L, B on a solved cube like the engine', () => {
    expect(applyMove(solvedFacelets, 'U')).toBe('UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB')
    expect(applyMove(solvedFacelets, 'F')).toBe('UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB')
    expect(applyMove(solvedFacelets, 'D')).toBe('UUUUUUUUURRRRRRFFFFFFFFFLLLDDDDDDDDDLLLLLLBBBBBBBBBRRR')
    expect(applyMove(solvedFacelets, 'L')).toBe('BUUBUUBUURRRRRRRRRUFFUFFUFFFDDFDDFDDLLLLLLLLLBBDBBDBBD')
    expect(applyMove(solvedFacelets, 'B')).toBe('RRRUUUUUURRDRRDRRDFFFFFFFFFDDDDDDLLLULLULLULLBBBBBBBBB')
  })

  it('returns to identity after four quarter turns', () => {
    for (const move of allMoves) {
      const afterFour = applyMoves(solvedFacelets, [move, move, move, move])
      expect(afterFour).toBe(solvedFacelets)
    }
  })

  it('matches prime and double turns with repeated quarter turns', () => {
    for (const face of ['U', 'R', 'F', 'D', 'L', 'B'] as const) {
      const scrambled = applyMoves(solvedFacelets, 'R U F D L B')
      expect(applyMove(scrambled, `${face}'` as Move)).toBe(applyMoves(scrambled, [face, face, face]))
      expect(applyMove(scrambled, `${face}2` as Move)).toBe(applyMoves(scrambled, [face, face]))
    }
  })

  it('returns to identity after six sexy moves', () => {
    const sexyMove: Move[] = ['R', 'U', "R'", "U'"]
    const sixTimes = Array.from({ length: 6 }, () => sexyMove).flat()
    expect(applyMoves(solvedFacelets, sixTimes)).toBe(solvedFacelets)
    expect(applyMoves(solvedFacelets, sexyMove)).not.toBe(solvedFacelets)
  })

  it('undoes a scramble with its inverse', () => {
    const scramble = generateScramble(25)
    const scrambled = applyMoves(solvedFacelets, scramble)
    expect(isSolved(scrambled)).toBe(false)
    expect(applyMoves(scrambled, invertSequence(scramble))).toBe(solvedFacelets)
  })

  it('generates scrambles without consecutive same-face moves', () => {
    const scramble = generateScramble(200)
    expect(scramble).toHaveLength(200)
    for (let index = 1; index < scramble.length; index++) {
      expect(scramble[index][0]).not.toBe(scramble[index - 1][0])
    }
  })
})
