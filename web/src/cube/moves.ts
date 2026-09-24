import { isFace, type Face } from './facelets'
import { faceLayer, faceletIndexAt, faceletPlacements, rotateQuarter, type Axis } from './geometry'

export type MoveSuffix = '' | "'" | '2'

export type Move = `${Face}${MoveSuffix}`

export const moveSuffixes: MoveSuffix[] = ['', "'", '2']

export const allMoves: Move[] = (['U', 'R', 'F', 'D', 'L', 'B'] as Face[]).flatMap((face) =>
  moveSuffixes.map((suffix) => `${face}${suffix}` as Move),
)

export interface ParsedMove {
  face: Face
  clockwiseTurns: 1 | 2 | 3
}

export function isMove(token: string): token is Move {
  return (allMoves as string[]).includes(token)
}

export function parseMove(move: Move): ParsedMove {
  const face = move[0]
  if (!isFace(face)) throw new Error(`Invalid move ${move}`)
  const suffix = move.slice(1)
  const clockwiseTurns = suffix === "'" ? 3 : suffix === '2' ? 2 : 1
  return { face, clockwiseTurns }
}

export function parseMoveSequence(sequence: string): Move[] {
  return sequence
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (!isMove(token)) throw new Error(`Invalid move ${token}`)
      return token
    })
}

export function invertMove(move: Move): Move {
  const { face, clockwiseTurns } = parseMove(move)
  if (clockwiseTurns === 2) return move
  return (clockwiseTurns === 1 ? `${face}'` : face) as Move
}

function positiveQuarterTurnsPerClockwise(face: Face): number {
  return faceLayer[face].layer === 1 ? 3 : 1
}

export interface MoveRotation {
  axis: Axis
  layer: 1 | -1
  angle: number
}

export function moveRotation(move: Move): MoveRotation {
  const { face, clockwiseTurns } = parseMove(move)
  const { axis, layer } = faceLayer[face]
  const clockwiseSign = layer === 1 ? -1 : 1
  const signedTurns = clockwiseTurns === 3 ? -1 : clockwiseTurns
  return { axis, layer, angle: (clockwiseSign * signedTurns * Math.PI) / 2 }
}

function buildPermutation(move: Move): number[] {
  const { face, clockwiseTurns } = parseMove(move)
  const { axis, layer } = faceLayer[face]
  const quarterTurns = positiveQuarterTurnsPerClockwise(face) * clockwiseTurns
  return faceletPlacements.map((placement, index) => {
    if (placement.cubie[axis] !== layer) return index
    return faceletIndexAt(
      rotateQuarter(placement.cubie, axis, quarterTurns),
      rotateQuarter(placement.normal, axis, quarterTurns),
    )
  })
}

const permutationByMove = new Map(allMoves.map((move) => [move, buildPermutation(move)]))

export function applyMove(facelets: string, move: Move): string {
  const destination = permutationByMove.get(move)
  if (!destination) throw new Error(`Invalid move ${move}`)
  const result = new Array<string>(54)
  for (let index = 0; index < 54; index++) result[destination[index]] = facelets[index]
  return result.join('')
}

export function applyMoves(facelets: string, moves: readonly Move[] | string): string {
  const sequence = typeof moves === 'string' ? parseMoveSequence(moves) : moves
  return sequence.reduce(applyMove, facelets)
}

export function invertSequence(moves: readonly Move[]): Move[] {
  return [...moves].reverse().map(invertMove)
}
