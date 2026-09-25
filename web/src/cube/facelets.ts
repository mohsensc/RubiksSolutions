export const faceOrder = ['U', 'R', 'F', 'D', 'L', 'B'] as const

export type Face = (typeof faceOrder)[number]

export type FaceletChar = Face | '?'

export const faceOffset: Record<Face, number> = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 }

export const solvedFacelets = faceOrder.map((face) => face.repeat(9)).join('')

export const faceColors: Record<Face, string> = {
  U: '#f3f2ee',
  R: '#d8232f',
  F: '#12a150',
  D: '#ffd21a',
  L: '#ff6f14',
  B: '#1d57d6',
}

export const faceColorNames: Record<Face, string> = {
  U: 'White',
  R: 'Red',
  F: 'Green',
  D: 'Yellow',
  L: 'Orange',
  B: 'Blue',
}

export const centerIndices = faceOrder.map((face) => faceOffset[face] + 4)

export function isFace(value: string): value is Face {
  return (faceOrder as readonly string[]).includes(value)
}

export function isSolved(facelets: string): boolean {
  return faceOrder.every((face) => {
    const start = faceOffset[face]
    const centerColor = facelets[start + 4]
    for (let index = start; index < start + 9; index++) {
      if (facelets[index] !== centerColor) return false
    }
    return true
  })
}

export function countColors(facelets: string): Record<FaceletChar, number> {
  const counts: Record<FaceletChar, number> = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0, '?': 0 }
  for (const char of facelets) {
    if (char in counts) counts[char as FaceletChar]++
  }
  return counts
}
