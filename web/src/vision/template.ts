import type { CornerPoint, FaceGeometry, FrameTemplate, PhotoFace, Point, TemplateGeometry } from './types'

export const defaultTemplateSize = 0.34

export const templateViewDistance = 8.5

export const cubeHalfEdge = 1.5

const inverseSqrt2 = 1 / Math.sqrt(2)
const inverseSqrt3 = 1 / Math.sqrt(3)
const inverseSqrt6 = 1 / Math.sqrt(6)
const orthographicHexagonRadius = cubeHalfEdge * Math.sqrt(8 / 3)

export function defaultTemplate(width: number, height: number): FrameTemplate {
  const isPortrait = height > width * 1.2
  return { centerX: 0.5, centerY: isPortrait ? 0.46 : 0.5, size: defaultTemplateSize, rotation: 0 }
}

export function templateRadiusPixels(template: FrameTemplate, width: number, height: number): number {
  return template.size * Math.min(width, height)
}

export function cornerProjector(template: FrameTemplate, width: number, height: number): (point: CornerPoint) => Point {
  const centerX = template.centerX * width
  const centerY = template.centerY * height
  const scale = templateRadiusPixels(template, width, height) / orthographicHexagonRadius
  const rotation = template.rotation ?? 0
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const tiltX = template.tiltX ?? 0
  const tiltY = template.tiltY ?? 0
  const cosineX = Math.cos(tiltX)
  const sineX = Math.sin(tiltX)
  const cosineY = Math.cos(tiltY)
  const sineY = Math.sin(tiltY)
  const nearCornerDepth = cubeHalfEdge * Math.sqrt(3)
  return ([right, top, left]: CornerPoint): Point => {
    const viewX = (right - left) * inverseSqrt2
    const viewY = (right - 2 * top + left) * inverseSqrt6
    const viewZ = (right + top + left) * inverseSqrt3
    const yawedX = cosineY * viewX + sineY * viewZ
    const yawedZ = -sineY * viewX + cosineY * viewZ
    const pitchedY = cosineX * viewY - sineX * yawedZ
    const pitchedZ = sineX * viewY + cosineX * yawedZ
    const shiftX = sineY * nearCornerDepth
    const shiftY = -sineX * cosineY * nearCornerDepth
    const perspective = (scale * templateViewDistance) / (templateViewDistance - pitchedZ)
    const screenX = (yawedX - shiftX) * perspective
    const screenY = (pitchedY - shiftY) * perspective
    return [centerX + cosine * screenX - sine * screenY, centerY + sine * screenX + cosine * screenY]
  }
}

type FacePoint = (row: number, column: number) => CornerPoint

export const faceSurfaces: Record<PhotoFace, FacePoint> = {
  top: (row, column) => [column - cubeHalfEdge, cubeHalfEdge, row - cubeHalfEdge],
  left: (row, column) => [column - cubeHalfEdge, cubeHalfEdge - row, cubeHalfEdge],
  right: (row, column) => [cubeHalfEdge, cubeHalfEdge - row, cubeHalfEdge - column],
}

export function cellCenterPoint(photoFace: PhotoFace, cell: number): CornerPoint {
  return faceSurfaces[photoFace](Math.floor(cell / 3) + 0.5, (cell % 3) + 0.5)
}

const hexagonCorners: CornerPoint[] = [
  [-1, 1, -1],
  [1, 1, -1],
  [1, -1, -1],
  [1, -1, 1],
  [-1, -1, 1],
  [-1, 1, 1],
].map(([right, top, left]) => [right * cubeHalfEdge, top * cubeHalfEdge, left * cubeHalfEdge] as const)

export function templateGeometry(template: FrameTemplate, width: number, height: number): TemplateGeometry {
  const project = cornerProjector(template, width, height)
  const faces = Object.fromEntries(
    (Object.keys(faceSurfaces) as PhotoFace[]).map((photoFace) => {
      const surface = faceSurfaces[photoFace]
      const geometry: FaceGeometry = {
        polygon: [surface(0, 0), surface(0, 3), surface(3, 3), surface(3, 0)].map(project),
        cellCenters: Array.from({ length: 9 }, (_, cell) => project(cellCenterPoint(photoFace, cell))),
      }
      return [photoFace, geometry]
    }),
  ) as Record<PhotoFace, FaceGeometry>
  return { hexagon: hexagonCorners.map(project), faces }
}
