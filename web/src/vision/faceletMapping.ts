import type { Face } from '../cube/facelets'
import { faceletIndexAt, faceNormals, type Vec3 } from '../cube/geometry'
import { photoFaces, type PhotoFace } from './types'

export type ShotOrientation = Record<PhotoFace, Face>

export const firstShotOrientation: ShotOrientation = { top: 'U', left: 'F', right: 'R' }

export const secondShotOrientations: readonly ShotOrientation[] = [
  { top: 'D', left: 'L', right: 'B' },
  { top: 'L', left: 'B', right: 'D' },
  { top: 'B', left: 'D', right: 'L' },
]

type CornerFrame = { right: Vec3; top: Vec3; left: Vec3 }

function photoCellInCornerFrame(photoFace: PhotoFace, row: number, column: number): { position: Vec3; normal: Vec3 } {
  switch (photoFace) {
    case 'top':
      return { position: [column - 1, 1, row - 1], normal: [0, 1, 0] }
    case 'left':
      return { position: [column - 1, 1 - row, 1], normal: [0, 0, 1] }
    case 'right':
      return { position: [1, 1 - row, 1 - column], normal: [1, 0, 0] }
  }
}

function toCubeFrame(frame: CornerFrame, vector: Vec3): Vec3 {
  const [rightAmount, topAmount, leftAmount] = vector
  const along = (axis: number) =>
    rightAmount * frame.right[axis] + topAmount * frame.top[axis] + leftAmount * frame.left[axis] + 0
  return [along(0), along(1), along(2)]
}

function isRightHanded(frame: CornerFrame): boolean {
  const [ax, ay, az] = frame.right
  const [bx, by, bz] = frame.top
  const cross = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]
  return cross.every((value, axis) => value === frame.left[axis])
}

export function photoFaceletIndices(orientation: ShotOrientation): Record<PhotoFace, number[]> {
  const frame: CornerFrame = {
    right: faceNormals[orientation.right],
    top: faceNormals[orientation.top],
    left: faceNormals[orientation.left],
  }
  if (!isRightHanded(frame)) throw new Error('Shot orientation is not a physical corner view')
  return Object.fromEntries(
    photoFaces.map((photoFace) => [
      photoFace,
      Array.from({ length: 9 }, (_, cell) => {
        const { position, normal } = photoCellInCornerFrame(photoFace, Math.floor(cell / 3), cell % 3)
        return faceletIndexAt(toCubeFrame(frame, position), toCubeFrame(frame, normal))
      }),
    ]),
  ) as Record<PhotoFace, number[]>
}

export const firstShotFacelets = photoFaceletIndices(firstShotOrientation)

export const secondShotFaceletVariants = secondShotOrientations.map(photoFaceletIndices)
