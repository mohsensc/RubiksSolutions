import { chroma, classifyColor, defaultPalette, labDistance, stickerColors, stickerCssColor, type StickerPalette } from './color'
import { alignTemplate, shiftedFitRatio } from './align'
import { buildIntegralImage, downsampleImage } from './integralImage'
import { darkestAlongSegment, samplePatch, snapToSticker } from './sampling'
import { applyHomography, planeHomography } from './homography'
import { cornerProjector, faceSurfaces, templateRadiusPixels } from './template'
import {
  photoFaces,
  type DetectionReason,
  type FrameTemplate,
  type ImageLike,
  type PhotoFace,
  type Point,
  type ShotDetection,
  type StickerSample,
} from './types'

export interface DetectOptions {
  palette?: StickerPalette
  align?: boolean
}

export const detectionThresholds = {
  patchFraction: 0.1,
  snapFraction: 0.12,
  minimumLightness: 5,
  relativeLightness: 0.18,
  maximumDeviation: 17,
  minimumChroma: 14,
  relativeWhiteLightness: 0.55,
  faceReferenceShare: 0.5,
  minimumStickersPerFace: 8,
  minimumStickers: 26,
  minimumStickersOnCrispGrid: 24,
  minimumStickersPerFaceOnCrispGrid: 7,
  crispGapScore: 0.88,
  crispFaceGapScore: 0.8,
  crispBorderScore: 0.75,
  minimumGapContrast: 9,
  gapContrastShareOfReference: 0.2,
  relativeGapContrast: 0.2,
  minimumFaceGapScore: 0.66,
  minimumGapScore: 0.78,
  minimumCenterDistance: 16,
  maximumSameColor: 12,
  minimumConfidence: 0.7,
  maximumShiftedFitRatio: 0.8,
}

const gridNeighbors: [number, number][] = [
  [0, 1],
  [1, 2],
  [3, 4],
  [4, 5],
  [6, 7],
  [7, 8],
  [0, 3],
  [3, 6],
  [1, 4],
  [4, 7],
  [2, 5],
  [5, 8],
]

function faceReferenceLightness(faceSamples: StickerSample[], brightestLightness: number): number {
  const faceBrightest = Math.max(...faceSamples.map((sample) => sample.lab[0]))
  return Math.max(faceBrightest, brightestLightness * detectionThresholds.faceReferenceShare)
}

function looksLikeSticker(sample: StickerSample, referenceLightness: number): boolean {
  const [lightness] = sample.lab
  if (lightness < Math.max(detectionThresholds.minimumLightness, referenceLightness * detectionThresholds.relativeLightness)) return false
  if (Math.sqrt(sample.variance) > detectionThresholds.maximumDeviation) return false
  return chroma(sample.lab) >= detectionThresholds.minimumChroma || lightness >= referenceLightness * detectionThresholds.relativeWhiteLightness
}

type FaceMapping = (row: number, column: number) => Point

function templateFaceMappings(template: FrameTemplate, width: number, height: number): Record<PhotoFace, FaceMapping> {
  const project = cornerProjector(template, width, height)
  return Object.fromEntries(
    photoFaces.map((photoFace) => {
      const homography = planeHomography(project, faceSurfaces[photoFace])
      return [photoFace, (row: number, column: number) => applyHomography(homography, row, column)]
    }),
  ) as Record<PhotoFace, FaceMapping>
}

const lineFractions = [0.2, 0.5, 0.8]
const crossingHalfLength = 0.16

function requiredGapContrast(stickerLightness: number, referenceLightness: number): number {
  const floor = Math.min(detectionThresholds.minimumGapContrast, referenceLightness * detectionThresholds.gapContrastShareOfReference)
  return Math.max(floor, stickerLightness * detectionThresholds.relativeGapContrast)
}

function gridLineScore(image: ImageLike, surface: FaceMapping, samples: StickerSample[], referenceLightness: number): number {
  let darkPoints = 0
  let totalPoints = 0
  for (const [first, second] of gridNeighbors) {
    const stickerLightness = Math.min(samples[first].lab[0], samples[second].lab[0])
    const required = requiredGapContrast(stickerLightness, referenceLightness)
    const isColumnBoundary = second - first === 1
    const row = Math.floor(first / 3)
    const column = first % 3
    for (const fraction of lineFractions) {
      const [lineRow, lineColumn] = isColumnBoundary ? [row + fraction, column + 1] : [row + 1, column + fraction]
      const [beforeRow, beforeColumn] = isColumnBoundary ? [lineRow, lineColumn - crossingHalfLength] : [lineRow - crossingHalfLength, lineColumn]
      const [afterRow, afterColumn] = isColumnBoundary ? [lineRow, lineColumn + crossingHalfLength] : [lineRow + crossingHalfLength, lineColumn]
      const darkest = darkestAlongSegment(image, surface(beforeRow, beforeColumn), surface(afterRow, afterColumn), 0, 1)
      totalPoints++
      if (stickerLightness - darkest >= required) darkPoints++
    }
  }
  return darkPoints / totalPoints
}

const borderSpan: [number, number] = [0.34, 0.62]

const borderCrossings: { cell: number; rowDirection: number; columnDirection: number }[] = [0, 1, 2].flatMap((index) => [
  { cell: index, rowDirection: -1, columnDirection: 0 },
  { cell: 6 + index, rowDirection: 1, columnDirection: 0 },
  { cell: index * 3, rowDirection: 0, columnDirection: -1 },
  { cell: index * 3 + 2, rowDirection: 0, columnDirection: 1 },
])

function faceBorderScore(image: ImageLike, surface: FaceMapping, samples: StickerSample[], referenceLightness: number): number {
  let darkPoints = 0
  for (const { cell, rowDirection, columnDirection } of borderCrossings) {
    const row = Math.floor(cell / 3) + 0.5
    const column = (cell % 3) + 0.5
    const stickerLightness = samples[cell].lab[0]
    const required = requiredGapContrast(stickerLightness, referenceLightness)
    const from = surface(row + rowDirection * borderSpan[0], column + columnDirection * borderSpan[0])
    const to = surface(row + rowDirection * borderSpan[1], column + columnDirection * borderSpan[1])
    if (stickerLightness - darkestAlongSegment(image, from, to, 0, 1) >= required) darkPoints++
  }
  return darkPoints / borderCrossings.length
}

function cellSpacing(centers: Point[], cell: number): number {
  const neighbor = centers[cell === 4 ? 5 : 4]
  return Math.hypot(neighbor[0] - centers[cell][0], neighbor[1] - centers[cell][1])
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export const detectionMaximumShorterSide = 400

export function detectShot(sourceImage: ImageLike, template: FrameTemplate, options: DetectOptions = {}): ShotDetection {
  const { image, factor } = downsampleImage(sourceImage, detectionMaximumShorterSide)
  const detection = detectOnImage(image, template, options)
  if (factor === 1) return detection
  const scaledPoints = Object.fromEntries(
    photoFaces.map((photoFace) => [photoFace, detection.samplePoints[photoFace].map(([x, y]): Point => [x * factor, y * factor])]),
  ) as Record<PhotoFace, Point[]>
  return { ...detection, samplePoints: scaledPoints }
}

function detectOnImage(image: ImageLike, template: FrameTemplate, options: DetectOptions): ShotDetection {
  const palette = options.palette ?? defaultPalette
  const integral = buildIntegralImage(image)
  const alignedTemplate = options.align === false ? template : alignTemplate(image, template, integral)
  const faceMappings = templateFaceMappings(alignedTemplate, image.width, image.height)
  const patchHalfSize = Math.max(
    1,
    templateRadiusPixels(alignedTemplate, image.width, image.height) * detectionThresholds.patchFraction * 0.5,
  )
  const faces = {} as Record<PhotoFace, StickerSample[]>
  const previewColors = {} as Record<PhotoFace, string[]>
  const sampleCenters = {} as Record<PhotoFace, Point[]>
  const colorCounts = new Map<string, number>()
  for (const photoFace of photoFaces) {
    const mapping = faceMappings[photoFace]
    const gridCenters = Array.from({ length: 9 }, (_, cell) => mapping(Math.floor(cell / 3) + 0.5, (cell % 3) + 0.5))
    const centers = gridCenters.map((center, cell, all) =>
      snapToSticker(image, center, cellSpacing(all, cell) * detectionThresholds.snapFraction, patchHalfSize),
    )
    sampleCenters[photoFace] = centers
    faces[photoFace] = centers.map((center) => samplePatch(image, center, patchHalfSize))
    previewColors[photoFace] = faces[photoFace].map((sample) => {
      const color = classifyColor(sample.lab, palette)
      colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1)
      return stickerCssColor[color]
    })
  }
  const allSamples = photoFaces.flatMap((photoFace) => faces[photoFace])
  const brightestLightness = Math.max(...allSamples.map((sample) => sample.lab[0]))
  const gapScores: number[] = []
  const borderScores: number[] = []
  let stickerCount = 0
  const faceStickerCounts: number[] = []
  for (const photoFace of photoFaces) {
    const referenceLightness = faceReferenceLightness(faces[photoFace], brightestLightness)
    const faceStickers = faces[photoFace].filter((sample) => looksLikeSticker(sample, referenceLightness)).length
    stickerCount += faceStickers
    faceStickerCounts.push(faceStickers)
    gapScores.push(gridLineScore(image, faceMappings[photoFace], faces[photoFace], referenceLightness))
    borderScores.push(faceBorderScore(image, faceMappings[photoFace], faces[photoFace], referenceLightness))
  }
  const uniformity = allSamples.reduce((sum, sample) => sum + clampUnit(1 - Math.sqrt(sample.variance) / 24), 0)
  const gapScore = gapScores.reduce((sum, score) => sum + score, 0) / gapScores.length
  const stickerScore = stickerCount / 27
  const confidence = clampUnit(0.35 * stickerScore + 0.4 * gapScore + 0.25 * (uniformity / 27))
  const centerSamples = photoFaces.map((photoFace) => faces[photoFace][4].lab)
  const centersAreDistinct = centerSamples.every((lab, index) =>
    centerSamples.slice(index + 1).every((other) => labDistance(lab, other) >= detectionThresholds.minimumCenterDistance),
  )
  const largestColorCount = Math.max(...stickerColors.map((color) => colorCounts.get(color) ?? 0))
  let reason: DetectionReason | undefined
  const borderScore = borderScores.reduce((sum, score) => sum + score, 0) / borderScores.length
  const hasCrispGrid =
    gapScore >= detectionThresholds.crispGapScore &&
    gapScores.every((score) => score >= detectionThresholds.crispFaceGapScore) &&
    borderScore >= detectionThresholds.crispBorderScore
  const enoughStickers = hasCrispGrid
    ? stickerCount >= detectionThresholds.minimumStickersOnCrispGrid &&
      faceStickerCounts.every((count) => count >= detectionThresholds.minimumStickersPerFaceOnCrispGrid)
    : stickerCount >= detectionThresholds.minimumStickers &&
      faceStickerCounts.every((count) => count >= detectionThresholds.minimumStickersPerFace)
  if (!enoughStickers) reason = 'notStickers'
  else if (
    gapScore < detectionThresholds.minimumGapScore ||
    gapScores.some((score) => score < detectionThresholds.minimumFaceGapScore) ||
    shiftedFitRatio(image, alignedTemplate, integral) > detectionThresholds.maximumShiftedFitRatio
  )
    reason = 'noGrid'
  else if (!centersAreDistinct) reason = 'sameCenters'
  else if (largestColorCount > detectionThresholds.maximumSameColor) reason = 'implausibleColors'
  else if (confidence < detectionThresholds.minimumConfidence) reason = 'lowConfidence'
  return {
    detected: reason === undefined,
    confidence: reason === undefined ? confidence : Math.min(confidence, detectionThresholds.minimumConfidence - 0.01),
    reason,
    faces,
    previewColors,
    alignedTemplate,
    samplePoints: sampleCenters,
  }
}
