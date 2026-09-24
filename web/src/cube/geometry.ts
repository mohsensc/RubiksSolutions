import { faceOffset, faceOrder, type Face } from './facelets'

export type Vec3 = readonly [number, number, number]

export type Axis = 0 | 1 | 2

export interface FaceletPlacement {
  face: Face
  cubie: Vec3
  normal: Vec3
}

export const faceNormals: Record<Face, Vec3> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
}

export const faceLayer: Record<Face, { axis: Axis; layer: 1 | -1 }> = {
  U: { axis: 1, layer: 1 },
  R: { axis: 0, layer: 1 },
  F: { axis: 2, layer: 1 },
  D: { axis: 1, layer: -1 },
  L: { axis: 0, layer: -1 },
  B: { axis: 2, layer: -1 },
}

function cubieForFacelet(face: Face, row: number, column: number): Vec3 {
  switch (face) {
    case 'U':
      return [column - 1, 1, row - 1]
    case 'R':
      return [1, 1 - row, 1 - column]
    case 'F':
      return [column - 1, 1 - row, 1]
    case 'D':
      return [column - 1, -1, 1 - row]
    case 'L':
      return [-1, 1 - row, column - 1]
    case 'B':
      return [1 - column, 1 - row, -1]
  }
}

export const faceletPlacements: FaceletPlacement[] = faceOrder.flatMap((face) =>
  Array.from({ length: 9 }, (_, position) => ({
    face,
    cubie: cubieForFacelet(face, Math.floor(position / 3), position % 3),
    normal: faceNormals[face],
  })),
)

function placementKey(cubie: Vec3, normal: Vec3): string {
  return `${cubie.join(',')}|${normal.join(',')}`
}

const faceletIndexByPlacement = new Map(
  faceletPlacements.map((placement, index) => [placementKey(placement.cubie, placement.normal), index]),
)

export function faceletIndexAt(cubie: Vec3, normal: Vec3): number {
  const index = faceletIndexByPlacement.get(placementKey(cubie, normal))
  if (index === undefined) throw new Error(`No facelet at ${placementKey(cubie, normal)}`)
  return index
}

export function rotateQuarter(vector: Vec3, axis: Axis, quarterTurns: number): Vec3 {
  let [x, y, z] = vector
  const turns = ((quarterTurns % 4) + 4) % 4
  for (let step = 0; step < turns; step++) {
    if (axis === 0) [y, z] = [-z, y]
    else if (axis === 1) [x, z] = [z, -x]
    else [x, y] = [-y, x]
  }
  return [x + 0, y + 0, z + 0]
}

export const cubiePositions: Vec3[] = [-1, 0, 1].flatMap((x) =>
  [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z) => [x, y, z] as Vec3)),
)

export function faceletsOfCubie(cubie: Vec3): number[] {
  return faceletPlacements.flatMap((placement, index) =>
    placement.cubie.every((value, axis) => value === cubie[axis]) ? [index] : [],
  )
}

export function faceOfLayer(axis: Axis, layer: number): Face | null {
  const match = faceOrder.find((face) => faceLayer[face].axis === axis && faceLayer[face].layer === layer)
  return match ?? null
}

export { faceOffset }
