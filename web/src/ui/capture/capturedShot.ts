import { faceColors } from '../../cube/facelets'
import {
  adaptPalette,
  classifyColor,
  defaultPalette,
  stickerDistance,
  type DetectOptions,
  type Lab,
  type PhotoFace,
  type ShotDetection,
  type StickerColor,
  type StickerPalette,
  type StickerSample,
} from '../../vision'
import { photoFaces } from './templateFit'

export interface CapturedShot {
  detection: ShotDetection
  colors: Record<PhotoFace, string[]>
}

function sampleColor(sample: StickerSample): string {
  const [red, green, blue] = sample.rgb.map((channel) => Math.round(Math.min(255, Math.max(0, channel))))
  return `rgb(${red} ${green} ${blue})`
}

export function captureShot(detection: ShotDetection): CapturedShot {
  const colors = Object.fromEntries(photoFaces.map((face) => [face, detection.faces[face].map(sampleColor)])) as Record<PhotoFace, string[]>
  return { detection, colors }
}

export const cubeGreen = faceColors.F

export function hasCameraSupport(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

export function detectionOptionsAfter(firstShot: CapturedShot | null): DetectOptions {
  if (!firstShot) return {}
  const labs = photoFaces.flatMap((face) => firstShot.detection.faces[face].map((sample) => sample.lab))
  const palette: StickerPalette = adaptPalette(defaultPalette, labs)
  return { palette }
}

const sameSideCenterDistance = 14
const minimumMatchingEdgeStickers = 7
const uniformFaceStickers = 8

const gridTransforms: ((row: number, column: number) => number)[] = [
  (row, column) => row * 3 + column,
  (row, column) => column * 3 + (2 - row),
  (row, column) => (2 - row) * 3 + (2 - column),
  (row, column) => (2 - column) * 3 + row,
  (row, column) => row * 3 + (2 - column),
  (row, column) => (2 - row) * 3 + column,
  (row, column) => column * 3 + row,
  (row, column) => (2 - column) * 3 + (2 - row),
]

interface FaceReading {
  labels: StickerColor[]
  centerLab: Lab
}

function faceReadings(detection: ShotDetection): FaceReading[] {
  const labs = photoFaces.flatMap((face) => detection.faces[face].map((sample) => sample.lab))
  const palette = adaptPalette(defaultPalette, labs)
  return photoFaces.map((face) => ({
    labels: detection.faces[face].map((sample) => classifyColor(sample.lab, palette)),
    centerLab: detection.faces[face][4].lab,
  }))
}

function isUniformFace(labels: StickerColor[]): boolean {
  return labels.filter((label) => label === labels[4]).length >= uniformFaceStickers
}

function isSameFace(first: FaceReading, second: FaceReading): boolean {
  if (first.labels[4] !== second.labels[4]) return false
  if (isUniformFace(first.labels) || isUniformFace(second.labels)) return stickerDistance(first.centerLab, second.centerLab) < sameSideCenterDistance
  return gridTransforms.some((transform) => {
    let matchingEdgeStickers = 0
    for (let cell = 0; cell < 9; cell++) {
      if (cell !== 4 && first.labels[cell] === second.labels[transform(Math.floor(cell / 3), cell % 3)]) matchingEdgeStickers++
    }
    return matchingEdgeStickers >= minimumMatchingEdgeStickers
  })
}

export function isSameSideAs(firstShot: CapturedShot | null, detection: ShotDetection | null): boolean {
  if (!firstShot || !detection?.detected) return false
  const firstFaces = faceReadings(firstShot.detection)
  return faceReadings(detection).some((nextFace) => firstFaces.some((firstFace) => isSameFace(firstFace, nextFace)))
}
