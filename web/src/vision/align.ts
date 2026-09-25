import { boxMean, buildIntegralImage, type IntegralImage } from './integralImage'
import { planeHomography } from './homography'
import { cellCenterPoint, cornerProjector, faceSurfaces, templateRadiusPixels } from './template'
import { photoFaces, type CornerPoint, type FrameTemplate, type ImageLike } from './types'

interface PoseOffset {
  offsetX: number
  offsetY: number
  scale: number
  rotation: number
  tiltX: number
  tiltY: number
}

type PoseParameter = keyof PoseOffset

export const alignmentRange: PoseOffset = {
  offsetX: 0.2,
  offsetY: 0.2,
  scale: 0.16,
  rotation: (15 * Math.PI) / 180,
  tiltX: (12 * Math.PI) / 180,
  tiltY: (12 * Math.PI) / 180,
}

const poseParameters = Object.keys(alignmentRange) as PoseParameter[]
const coarseParameters: PoseParameter[] = ['offsetX', 'offsetY', 'rotation', 'scale']
const neutralPose: PoseOffset = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, tiltX: 0, tiltY: 0 }
const probeSpread = 0.26
const dispersionWeight = 1
const brightnessFloor = 60
const dispersionBoxLimit = 0.1
const coarseLevelCount = 2
const searchLevels = [
  { boxFraction: 0.18, stepFraction: 0.25 },
  { boxFraction: 0.12, stepFraction: 0.12 },
  { boxFraction: 0.07, stepFraction: 0.06 },
  { boxFraction: 0.03, stepFraction: 0.03 },
]

const withinFaceNeighbors: [number, number][] = [
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

const seamNeighbors: [number, number][] = [
  [6, 9],
  [7, 10],
  [8, 11],
  [8, 18],
  [5, 19],
  [2, 20],
  [11, 18],
  [14, 21],
  [17, 24],
]

function offsetPoint(point: CornerPoint, toward: CornerPoint, amount: number): CornerPoint {
  return [
    point[0] + (toward[0] - point[0]) * amount,
    point[1] + (toward[1] - point[1]) * amount,
    point[2] + (toward[2] - point[2]) * amount,
  ]
}

const outerBoundaryCells: { faceIndex: number; cell: number; inward: number }[] = [
  ...[0, 1, 2].map((cell) => ({ faceIndex: 0, cell, inward: cell + 3 })),
  ...[0, 3, 6].map((cell) => ({ faceIndex: 0, cell, inward: cell + 1 })),
  ...[0, 3, 6].map((cell) => ({ faceIndex: 1, cell, inward: cell + 1 })),
  ...[6, 7, 8].map((cell) => ({ faceIndex: 1, cell, inward: cell - 3 })),
  ...[2, 5, 8].map((cell) => ({ faceIndex: 2, cell, inward: cell - 1 })),
  ...[6, 7, 8].map((cell) => ({ faceIndex: 2, cell, inward: cell - 3 })),
]

const crossingFractions = [-0.08, 0, 0.08]

function buildProbes() {
  const centers = photoFaces.flatMap((photoFace) => Array.from({ length: 9 }, (_, cell) => cellCenterPoint(photoFace, cell)))
  const cellProbes: CornerPoint[] = []
  centers.forEach((center, index) => {
    const faceStart = index - (index % 9)
    const cell = index % 9
    const row = Math.floor(cell / 3)
    const column = cell % 3
    const columnNeighbor = centers[faceStart + row * 3 + (column < 2 ? column + 1 : column - 1)]
    const rowNeighbor = centers[faceStart + (row < 2 ? row + 1 : row - 1) * 3 + column]
    cellProbes.push(
      center,
      offsetPoint(center, columnNeighbor, probeSpread),
      offsetPoint(center, columnNeighbor, -probeSpread),
      offsetPoint(center, rowNeighbor, probeSpread),
      offsetPoint(center, rowNeighbor, -probeSpread),
    )
  })
  const withinFacePairs = photoFaces.flatMap((_, faceIndex) =>
    withinFaceNeighbors.map(([first, second]): [number, number] => [faceIndex * 9 + first, faceIndex * 9 + second]),
  )
  const seamPoint = (first: number, second: number): CornerPoint => [
    Math.max(centers[first][0], centers[second][0]),
    Math.max(centers[first][1], centers[second][1]),
    Math.max(centers[first][2], centers[second][2]),
  ]
  const boundaries: { cells: [number, number]; crossing: CornerPoint[]; weight: number }[] = [
    ...withinFacePairs.map(([first, second]) => ({
      cells: [first, second] as [number, number],
      crossing: crossingFractions.map((shift) => offsetPoint(centers[first], centers[second], 0.5 + shift)),
      weight: 1,
    })),
    ...seamNeighbors.map(([first, second]) => {
      const edge = seamPoint(first, second)
      return {
        cells: [first, second] as [number, number],
        crossing: crossingFractions.map((shift) =>
          shift < 0 ? offsetPoint(edge, centers[first], -shift * 2) : offsetPoint(edge, centers[second], shift * 2),
        ),
        weight: 1,
      }
    }),
    ...outerBoundaryCells.map(({ faceIndex, cell, inward }) => {
      const center = centers[faceIndex * 9 + cell]
      const inwardCenter = centers[faceIndex * 9 + inward]
      return {
        cells: [faceIndex * 9 + cell, faceIndex * 9 + cell] as [number, number],
        crossing: crossingFractions.map((shift) => offsetPoint(center, inwardCenter, -0.5 + shift * 0.5)),
        weight: 1,
      }
    }),
  ]
  return {
    points: [...cellProbes, ...boundaries.flatMap((boundary) => boundary.crossing)],
    boundaryCells: boundaries.map((boundary) => boundary.cells),
    boundaryWeights: boundaries.map((boundary) => boundary.weight),
    cellProbeCount: cellProbes.length,
  }
}

const surfaceTolerance = 1e-9

function faceCoordinates([right, top, left]: CornerPoint): [number, number, number] {
  if (Math.abs(top - 1.5) < surfaceTolerance) return [0, left + 1.5, right + 1.5]
  if (Math.abs(left - 1.5) < surfaceTolerance) return [1, 1.5 - top, right + 1.5]
  return [2, 1.5 - top, 1.5 - left]
}

interface ProbeSet {
  faceIndices: Uint8Array
  rows: Float64Array
  columns: Float64Array
  xs: Float64Array
  ys: Float64Array
}

function probeSet(points: CornerPoint[]): ProbeSet {
  const coordinates = points.map(faceCoordinates)
  return {
    faceIndices: Uint8Array.from(coordinates, ([faceIndex]) => faceIndex),
    rows: Float64Array.from(coordinates, ([, row]) => row),
    columns: Float64Array.from(coordinates, ([, , column]) => column),
    xs: new Float64Array(points.length),
    ys: new Float64Array(points.length),
  }
}

function projectProbes(set: ProbeSet, template: FrameTemplate, width: number, height: number) {
  const project = cornerProjector(template, width, height)
  const homographies = photoFaces.map((photoFace) => planeHomography(project, faceSurfaces[photoFace]))
  const { faceIndices, rows, columns, xs, ys } = set
  for (let index = 0; index < faceIndices.length; index++) {
    const homography = homographies[faceIndices[index]]
    const row = rows[index]
    const column = columns[index]
    const weight = homography[6] * column + homography[7] * row + 1
    xs[index] = (homography[0] * column + homography[1] * row + homography[2]) / weight
    ys[index] = (homography[3] * column + homography[4] * row + homography[5]) / weight
  }
}

const probes = buildProbes()
const fineProbeSet = probeSet(probes.points)

const coarseProbes = (() => {
  const middle = Math.floor(crossingFractions.length / 2)
  return [
    ...Array.from({ length: 27 }, (_, cell) => probes.points[cell * 5]),
    ...probes.boundaryCells.map(
      (_, boundaryIndex) => probes.points[probes.cellProbeCount + boundaryIndex * crossingFractions.length + middle],
    ),
  ]
})()

const coarseProbeSet = probeSet(coarseProbes)

function coarseFit(integral: IntegralImage, template: FrameTemplate, boxRadius: number, colors: Float32Array, brightness: Float32Array): number {
  projectProbes(coarseProbeSet, template, integral.width, integral.height)
  const { xs, ys } = coarseProbeSet
  for (let index = 0; index < xs.length; index++) brightness[index] = boxMean(integral, xs[index], ys[index], boxRadius, colors, index)
  let gapReward = 0
  for (let boundaryIndex = 0; boundaryIndex < probes.boundaryCells.length; boundaryIndex++) {
    const [first, second] = probes.boundaryCells[boundaryIndex]
    const stickerBrightness = Math.min(brightness[first], brightness[second])
    gapReward +=
      (probes.boundaryWeights[boundaryIndex] * Math.max(0, stickerBrightness - brightness[27 + boundaryIndex])) /
      (stickerBrightness + brightnessFloor)
  }
  return gapReward
}

function poseTemplate(base: FrameTemplate, pose: PoseOffset, image: ImageLike): FrameTemplate {
  const radius = templateRadiusPixels(base, image.width, image.height)
  return {
    centerX: base.centerX + (pose.offsetX * radius) / image.width,
    centerY: base.centerY + (pose.offsetY * radius) / image.height,
    size: base.size * pose.scale,
    rotation: (base.rotation ?? 0) + pose.rotation,
    tiltX: (base.tiltX ?? 0) + pose.tiltX,
    tiltY: (base.tiltY ?? 0) + pose.tiltY,
  }
}

function gridFit(integral: IntegralImage, template: FrameTemplate, boxRadius: number, colors: Float32Array, brightness: Float32Array): number {
  projectProbes(fineProbeSet, template, integral.width, integral.height)
  const { xs, ys } = fineProbeSet
  for (let index = 0; index < xs.length; index++) brightness[index] = boxMean(integral, xs[index], ys[index], boxRadius, colors, index)
  let dispersion = 0
  for (let cell = 0; cell < 27; cell++) {
    const base = cell * 5
    let cellDispersion = 0
    for (let probe = 1; probe < 5; probe++) {
      cellDispersion +=
        Math.abs(colors[(base + probe) * 3] - colors[base * 3]) +
        Math.abs(colors[(base + probe) * 3 + 1] - colors[base * 3 + 1]) +
        Math.abs(colors[(base + probe) * 3 + 2] - colors[base * 3 + 2])
    }
    dispersion += Math.min(1, cellDispersion / (4 * (brightness[base] + brightnessFloor)))
  }
  let gapReward = 0
  probes.boundaryCells.forEach(([first, second], boundaryIndex) => {
    const stickerBrightness = Math.min(brightness[first * 5], brightness[second * 5])
    const start = probes.cellProbeCount + boundaryIndex * crossingFractions.length
    let darkest = Infinity
    for (let probe = 0; probe < crossingFractions.length; probe++) darkest = Math.min(darkest, brightness[start + probe])
    gapReward += (probes.boundaryWeights[boundaryIndex] * Math.max(0, stickerBrightness - darkest)) / (stickerBrightness + brightnessFloor)
  })
  return gapReward - dispersionWeight * dispersion
}

function isWithinRange(pose: PoseOffset, offsetAllowance = 0): boolean {
  return poseParameters.every((parameter) => {
    const neutral = neutralPose[parameter]
    const allowance = parameter === 'offsetX' || parameter === 'offsetY' ? offsetAllowance : 0
    return Math.abs(pose[parameter] - neutral) <= alignmentRange[parameter] + allowance + 1e-9
  })
}

function cellPixels(template: FrameTemplate, width: number, height: number): number {
  return templateRadiusPixels(template, width, height) / 3
}

function patternSearch(
  start: PoseOffset,
  fitOf: (pose: PoseOffset, boxFraction: number) => number,
  boxFraction: number,
  stepFraction: number,
  parameters: readonly PoseParameter[],
  offsetAllowance = 0,
) {
  let best = start
  let bestFit = fitOf(best, boxFraction)
  let improved = true
  while (improved) {
    improved = false
    for (const parameter of parameters) {
      for (const direction of [1, -1]) {
        const candidate = { ...best, [parameter]: best[parameter] + direction * alignmentRange[parameter] * stepFraction }
        if (!isWithinRange(candidate, offsetAllowance)) continue
        const fit = fitOf(candidate, boxFraction)
        if (fit > bestFit) {
          bestFit = fit
          best = candidate
          improved = true
        }
      }
    }
  }
  return { pose: best, fit: bestFit }
}

const cubeAxes: CornerPoint[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]
const shiftRounds = 2
const promisingShiftRatio = 0.7
const shiftOffsetAllowance = 0.5
const shiftCandidates = 2
const refinedCandidates = 2
const finalBoxFraction = 0.03
const samePoseTolerance = 0.05

function isSamePose(first: PoseOffset, second: PoseOffset): boolean {
  return poseParameters.every(
    (parameter) => Math.abs(first[parameter] - second[parameter]) <= alignmentRange[parameter] * samePoseTolerance,
  )
}

const searchStarts: PoseOffset[] = [-0.5, 0, 0.5].flatMap((rotation) =>
  [-0.5, 0, 0.5].map((scale) => ({
    ...neutralPose,
    rotation: rotation * alignmentRange.rotation,
    scale: 1 + scale * alignmentRange.scale,
  })),
)

export function alignTemplate(image: ImageLike, template: FrameTemplate, integral: IntegralImage = buildIntegralImage(image)): FrameTemplate {
  const colors = new Float32Array(probes.points.length * 3)
  const brightness = new Float32Array(probes.points.length)
  const cell = cellPixels(template, image.width, image.height)
  const fitOf = (pose: PoseOffset, boxFraction: number) =>
    boxFraction > dispersionBoxLimit
      ? coarseFit(integral, poseTemplate(template, pose, image), cell * boxFraction, colors, brightness)
      : gridFit(integral, poseTemplate(template, pose, image), Math.max(0, cell * boxFraction), colors, brightness)
  const coarseLevels = searchLevels.slice(0, coarseLevelCount)
  const fineLevels = searchLevels.slice(coarseLevelCount)
  const selectionBox = fineLevels[0].boxFraction
  const refine = (start: PoseOffset, offsetAllowance = 0) =>
    fineLevels.reduce(
      (pose, level) => patternSearch(pose, fitOf, level.boxFraction, level.stepFraction, poseParameters, offsetAllowance).pose,
      start,
    )
  const [firstLevel, secondLevel] = coarseLevels
  const coarseCandidates = searchStarts
    .map((start) => patternSearch(start, fitOf, firstLevel.boxFraction, firstLevel.stepFraction, coarseParameters))
    .filter(({ pose }, index, all) => all.slice(0, index).every((other) => !isSamePose(other.pose, pose)))
    .map(({ pose }) => patternSearch(pose, fitOf, secondLevel.boxFraction, secondLevel.stepFraction, poseParameters).pose)
    .map((pose) => ({ pose, fit: fitOf(pose, selectionBox) }))
    .sort((first, second) => second.fit - first.fit)
    .filter(({ pose }, index, all) => all.slice(0, index).every((other) => !isSamePose(other.pose, pose)))
    .slice(0, refinedCandidates)
    .map(({ pose }) => refine(pose))
    .map((pose) => ({ pose, fit: fitOf(pose, finalBoxFraction) }))
  let { pose: best, fit: bestFit } = coarseCandidates.reduce((winner, candidate) => (candidate.fit > winner.fit ? candidate : winner))
  for (let round = 0; round < shiftRounds; round++) {
    const currentSelectionFit = fitOf(best, selectionBox)
    const project = cornerProjector(poseTemplate(template, best, image), image.width, image.height)
    const radius = templateRadiusPixels(template, image.width, image.height)
    const origin = project([0, 0, 0])
    const shifted = cubeAxes
      .map((axis) => {
        const [x, y] = project(axis)
        return { ...best, offsetX: best.offsetX + (x - origin[0]) / radius, offsetY: best.offsetY + (y - origin[1]) / radius }
      })
      .filter((pose) => isWithinRange(pose, shiftOffsetAllowance))
      .map((pose) => ({ pose, fit: fitOf(pose, selectionBox) }))
      .filter(({ fit }) => fit > currentSelectionFit * promisingShiftRatio)
      .sort((first, second) => second.fit - first.fit)
      .slice(0, shiftCandidates)
      .map(({ pose }) => refine(pose, shiftOffsetAllowance))
      .map((pose) => ({ pose, fit: fitOf(pose, finalBoxFraction) }))
      .filter(({ fit }) => fit > bestFit)
    if (shifted.length === 0) break
    const winner = shifted.reduce((first, second) => (second.fit > first.fit ? second : first))
    best = winner.pose
    bestFit = winner.fit
  }
  return poseTemplate(template, best, image)
}

export function templateFit(image: ImageLike, template: FrameTemplate, boxFraction = 0): number {
  const cell = cellPixels(template, image.width, image.height)
  return gridFit(buildIntegralImage(image), template, cell * boxFraction, new Float32Array(probes.points.length * 3), new Float32Array(probes.points.length))
}

export function shiftedFitRatio(image: ImageLike, template: FrameTemplate, integral: IntegralImage = buildIntegralImage(image)): number {
  const colors = new Float32Array(probes.points.length * 3)
  const brightness = new Float32Array(probes.points.length)
  const box = cellPixels(template, image.width, image.height) * searchLevels[coarseLevelCount].boxFraction
  const current = gridFit(integral, template, box, colors, brightness)
  const project = cornerProjector(template, image.width, image.height)
  const origin = project([0, 0, 0])
  let best = -Infinity
  for (const axis of cubeAxes) {
    const [x, y] = project(axis)
    const shifted = {
      ...template,
      centerX: template.centerX + (x - origin[0]) / image.width,
      centerY: template.centerY + (y - origin[1]) / image.height,
    }
    best = Math.max(best, gridFit(integral, shifted, box, colors, brightness))
  }
  return best / Math.max(1e-6, current)
}
