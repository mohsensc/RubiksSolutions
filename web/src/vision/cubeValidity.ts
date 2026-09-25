import { faceOrder, type Face } from '../cube/facelets'

const cornerFacelets = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
] as const

const cornerColors: readonly (readonly [Face, Face, Face])[] = [
  ['U', 'R', 'F'],
  ['U', 'F', 'L'],
  ['U', 'L', 'B'],
  ['U', 'B', 'R'],
  ['D', 'F', 'R'],
  ['D', 'L', 'F'],
  ['D', 'B', 'L'],
  ['D', 'R', 'B'],
]

const edgeFacelets = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
] as const

const edgeColors: readonly (readonly [Face, Face])[] = [
  ['U', 'R'],
  ['U', 'F'],
  ['U', 'L'],
  ['U', 'B'],
  ['D', 'R'],
  ['D', 'F'],
  ['D', 'L'],
  ['D', 'B'],
  ['F', 'R'],
  ['F', 'L'],
  ['B', 'L'],
  ['B', 'R'],
]

export interface CubeConsistency {
  isValid: boolean
  score: number
}

function permutationParity(permutation: number[]): number {
  let parity = 0
  for (let first = 0; first < permutation.length; first++) {
    for (let second = first + 1; second < permutation.length; second++) {
      if (permutation[first] > permutation[second]) parity ^= 1
    }
  }
  return parity
}

export function cubeConsistency(facelets: string): CubeConsistency {
  const centersAreDistinct = faceOrder.every((face, index) => facelets[index * 9 + 4] === face)
  const cornerPermutation: number[] = []
  let cornerTwist = 0
  for (const positions of cornerFacelets) {
    const orientation = [0, 1, 2].find((turn) => facelets[positions[turn]] === 'U' || facelets[positions[turn]] === 'D')
    if (orientation === undefined) continue
    const firstSide = facelets[positions[(orientation + 1) % 3]]
    const secondSide = facelets[positions[(orientation + 2) % 3]]
    const piece = cornerColors.findIndex(
      (colors) => colors[0] === facelets[positions[orientation]] && colors[1] === firstSide && colors[2] === secondSide,
    )
    if (piece < 0) continue
    cornerPermutation.push(piece)
    cornerTwist += orientation
  }
  const edgePermutation: number[] = []
  let edgeFlip = 0
  for (const [first, second] of edgeFacelets) {
    const straight = edgeColors.findIndex((colors) => colors[0] === facelets[first] && colors[1] === facelets[second])
    if (straight >= 0) {
      edgePermutation.push(straight)
      continue
    }
    const flipped = edgeColors.findIndex((colors) => colors[1] === facelets[first] && colors[0] === facelets[second])
    if (flipped >= 0) {
      edgePermutation.push(flipped)
      edgeFlip += 1
    }
  }
  const distinctCorners = new Set(cornerPermutation).size
  const distinctEdges = new Set(edgePermutation).size
  const score = distinctCorners + distinctEdges
  const isValid =
    centersAreDistinct &&
    distinctCorners === 8 &&
    cornerPermutation.length === 8 &&
    distinctEdges === 12 &&
    edgePermutation.length === 12 &&
    cornerTwist % 3 === 0 &&
    edgeFlip % 2 === 0 &&
    permutationParity(cornerPermutation) === permutationParity(edgePermutation)
  return { isValid, score: score + (isValid ? 1 : 0) }
}
