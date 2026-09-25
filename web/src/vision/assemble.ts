import type { Face } from '../cube/facelets'
import { minimumCostAssignment } from './assignment'
import { defaultPalette, linearChannel, linearFromLab, stickerColors } from './color'
import { cubeConsistency } from './cubeValidity'
import {
  firstShotFacelets,
  firstShotOrientation,
  secondShotFaceletVariants,
  secondShotOrientations,
  type ShotOrientation,
} from './faceletMapping'
import { photoFaces, type PhotoFace, type Rgb, type ShotDetection } from './types'

type Chromaticity = [number, number, number]

export interface AssembledCube {
  facelets: string
  candidates: string[]
  balanced: boolean
}

interface LocatedSample {
  linear: Rgb
  shot: 0 | 1
  photoFace: PhotoFace
  cell: number
  faceGroup: number
}

const centerCell = 4
const refinementRounds = 6
const lockedCost = 1e6
const minimumLinear = 1e-4
const chromaticityFloor = 3
const repairSwapLimit = 80
const repairPairLimit = 24
const repairCycleCandidates = 12

function locatedSamples(firstShot: ShotDetection, secondShot: ShotDetection): LocatedSample[] {
  return ([firstShot, secondShot] as const).flatMap((shot, shotIndex) =>
    photoFaces.flatMap((photoFace, faceIndex) =>
      shot.faces[photoFace].map((sample, cell) => ({
        linear: sample.rgb.map((byte) => Math.max(minimumLinear, linearChannel(Math.round(byte)))) as Rgb,
        shot: shotIndex as 0 | 1,
        photoFace,
        cell,
        faceGroup: shotIndex * 3 + faceIndex,
      })),
    ),
  )
}

function centerIndexOfClass(samples: LocatedSample[]): number[] {
  return samples.flatMap((sample, index) => (sample.cell === centerCell ? [index] : []))
}

function chromaticity(linear: Rgb): Chromaticity {
  const total = linear[0] + linear[1] + linear[2]
  return [(100 * linear[0]) / total, (100 * linear[1]) / total, (100 * linear[2]) / total]
}

function chromaticityDistance(first: Chromaticity, second: Chromaticity): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

function balancedLinear(sample: LocatedSample, shotBalance: Rgb[]): Rgb {
  const balance = shotBalance[sample.shot]
  return [sample.linear[0] / balance[0], sample.linear[1] / balance[1], sample.linear[2] / balance[2]]
}

function fitShotBalance(samples: LocatedSample[], classes: number[], classChromaticity: Chromaticity[]): Rgb[] {
  return [0, 1].map((shot) => {
    const logRatios: number[][] = [[], [], []]
    samples.forEach((sample, index) => {
      if (sample.shot !== shot) return
      const expected = classChromaticity[classes[index]]
      const observed = chromaticity(sample.linear)
      for (let channel = 0; channel < 3; channel++) {
        if (expected[channel] > chromaticityFloor && observed[channel] > chromaticityFloor) {
          logRatios[channel].push(Math.log(observed[channel] / expected[channel]))
        }
      }
    })
    const factors = logRatios.map((ratios) => Math.exp(ratios.length ? median(ratios) : 0))
    const scale = Math.cbrt(factors[0] * factors[1] * factors[2])
    return factors.map((factor) => factor / scale) as Rgb
  })
}

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const paletteChromaticities: Chromaticity[] = stickerColors.map((color) => chromaticity(linearFromLab(defaultPalette[color])))

function meanChromaticity(features: Chromaticity[]): Chromaticity {
  return [0, 1, 2].map((channel) => features.reduce((sum, feature) => sum + feature[channel], 0) / Math.max(1, features.length)) as Chromaticity
}

interface ClassAssignment {
  classes: number[]
  classCost: number[][]
  balanced: boolean
}

function assignClasses(samples: LocatedSample[], features: Chromaticity[], references: Chromaticity[], lockCenters: boolean): ClassAssignment {
  const centers = centerIndexOfClass(samples)
  const classCost = samples.map((sample, sampleIndex) =>
    centers.map((centerIndex, classIndex) => {
      if (lockCenters && sample.cell === centerCell) return centerIndex === sampleIndex ? 0 : lockedCost
      return chromaticityDistance(features[sampleIndex], references[classIndex])
    }),
  )
  const nearestClasses = classCost.map((costs) => costs.indexOf(Math.min(...costs)))
  const expandedCost = classCost.map((costs) => costs.flatMap((cost) => Array.from({ length: 9 }, () => cost)))
  const classes = minimumCostAssignment(expandedCost).map((column) => Math.floor(column / 9))
  return { classes, classCost, balanced: classes.some((classIndex, index) => classIndex !== nearestClasses[index]) }
}

function balancedClasses(
  samples: LocatedSample[],
  initialReferences: (features: Chromaticity[]) => Chromaticity[],
  lockCenters: boolean,
): ClassAssignment & { features: Chromaticity[] } {
  const classCount = centerIndexOfClass(samples).length
  let shotBalance: Rgb[] = [
    [1, 1, 1],
    [1, 1, 1],
  ]
  let assignment: ClassAssignment = { classes: [], classCost: [], balanced: false }
  let features: Chromaticity[] = []
  for (let round = 0; round < refinementRounds; round++) {
    features = samples.map((sample) => chromaticity(balancedLinear(sample, shotBalance)))
    const classes = assignment.classes
    const references =
      round === 0
        ? initialReferences(features)
        : Array.from({ length: classCount }, (_, classIndex) =>
            meanChromaticity(features.filter((_, index) => classes[index] === classIndex)),
          )
    assignment = assignClasses(samples, features, references, lockCenters)
    const classChromaticity = Array.from({ length: classCount }, (_, classIndex) => {
      const members = samples
        .filter((_, index) => assignment.classes[index] === classIndex)
        .map((sample) => balancedLinear(sample, shotBalance))
      const mean = [0, 1, 2].map((channel) => members.reduce((sum, linear) => sum + linear[channel], 0) / Math.max(1, members.length)) as Rgb
      return chromaticity(mean)
    })
    shotBalance = fitShotBalance(samples, assignment.classes, classChromaticity)
  }
  return { ...assignment, features }
}

function centerMappings(features: Chromaticity[], clusters: number[], centers: number[]): Chromaticity[][] {
  const clusterReferences = centers.map((_, cluster) => meanChromaticity(features.filter((_, index) => clusters[index] === cluster)))
  const centerCost = centers.map((centerIndex) => clusterReferences.map((reference) => chromaticityDistance(features[centerIndex], reference)))
  const best = minimumCostAssignment(centerCost)
  const mappings = [best]
  for (let first = 0; first < best.length; first++) {
    for (let second = first + 1; second < best.length; second++) {
      const swapped = [...best]
      ;[swapped[first], swapped[second]] = [swapped[second], swapped[first]]
      mappings.push(swapped)
    }
  }
  const mappingCost = (mapping: number[]) => mapping.reduce((sum, cluster, classIndex) => sum + centerCost[classIndex][cluster], 0)
  return mappings
    .sort((first, second) => mappingCost(first) - mappingCost(second))
    .map((mapping) => mapping.map((cluster) => clusterReferences[cluster]))
}

function faceletsFor(samples: LocatedSample[], classes: number[], secondVariant: number): string {
  const orientations: ShotOrientation[] = [firstShotOrientation, secondShotOrientations[secondVariant]]
  const indexTables = [firstShotFacelets, secondShotFaceletVariants[secondVariant]]
  const centers = centerIndexOfClass(samples)
  const faceOfClass: Face[] = centers.map((index) => orientations[samples[index].shot][samples[index].photoFace])
  const facelets = new Array<string>(54).fill('?')
  samples.forEach((sample, index) => {
    facelets[indexTables[sample.shot][sample.photoFace][sample.cell]] = faceOfClass[classes[index]]
  })
  return facelets.join('')
}

interface StickerSwap {
  first: number
  second: number
  penalty: number
}

function cheapestSwaps(classes: number[], classCost: number[][]): StickerSwap[] {
  const swaps: StickerSwap[] = []
  for (let first = 0; first < classes.length; first++) {
    for (let second = first + 1; second < classes.length; second++) {
      const firstClass = classes[first]
      const secondClass = classes[second]
      if (firstClass === secondClass) continue
      const penalty =
        classCost[first][secondClass] + classCost[second][firstClass] - classCost[first][firstClass] - classCost[second][secondClass]
      if (penalty < lockedCost / 2) swaps.push({ first, second, penalty })
    }
  }
  return swaps.sort((left, right) => left.penalty - right.penalty).slice(0, repairSwapLimit)
}

function applySwaps(classes: number[], swaps: StickerSwap[]): number[] {
  const swapped = [...classes]
  for (const { first, second } of swaps) [swapped[first], swapped[second]] = [swapped[second], swapped[first]]
  return swapped
}

function suspiciousStickers(classes: number[], classCost: number[][]): number[] {
  return classes
    .map((classIndex, sample) => {
      const assigned = classCost[sample][classIndex]
      const alternatives = classCost[sample].filter((_, other) => other !== classIndex)
      return { sample, margin: Math.min(...alternatives) - assigned }
    })
    .filter(({ margin }) => margin < lockedCost / 2)
    .sort((first, second) => first.margin - second.margin)
    .slice(0, repairCycleCandidates)
    .map(({ sample }) => sample)
}

function cycledClasses(classes: number[], first: number, second: number, third: number): number[] {
  const cycled = [...classes]
  cycled[first] = classes[third]
  cycled[second] = classes[first]
  cycled[third] = classes[second]
  return cycled
}

function repairedByCycles(samples: LocatedSample[], classes: number[], suspects: number[], variant: number): string | null {
  for (let first = 0; first < suspects.length; first++) {
    for (let second = 0; second < suspects.length; second++) {
      for (let third = 0; third < suspects.length; third++) {
        if (first === second || second === third || first === third) continue
        const [a, b, c] = [suspects[first], suspects[second], suspects[third]]
        if (new Set([classes[a], classes[b], classes[c]]).size < 3) continue
        const facelets = faceletsFor(samples, cycledClasses(classes, a, b, c), variant)
        if (cubeConsistency(facelets).isValid) return facelets
      }
    }
  }
  return null
}

function repairedFacelets(
  samples: LocatedSample[],
  classes: number[],
  swaps: StickerSwap[],
  suspects: number[],
  variant: number,
): string | null {
  for (const swap of swaps) {
    const facelets = faceletsFor(samples, applySwaps(classes, [swap]), variant)
    if (cubeConsistency(facelets).isValid) return facelets
  }
  const pairLimit = Math.min(swaps.length, repairPairLimit)
  for (let first = 0; first < pairLimit; first++) {
    for (let second = first + 1; second < pairLimit; second++) {
      const firstSwap = swaps[first]
      const secondSwap = swaps[second]
      const touched = new Set([firstSwap.first, firstSwap.second, secondSwap.first, secondSwap.second])
      if (touched.size < 4) continue
      const facelets = faceletsFor(samples, applySwaps(classes, [firstSwap, secondSwap]), variant)
      if (cubeConsistency(facelets).isValid) return facelets
    }
  }
  return repairedByCycles(samples, classes, suspects, variant)
}

function variantsOf(samples: LocatedSample[], assignment: ClassAssignment) {
  return secondShotOrientations.map((_, variant) => {
    const facelets = faceletsFor(samples, assignment.classes, variant)
    return { facelets, variant, consistency: cubeConsistency(facelets), repaired: false }
  })
}

type AssembledVariant = ReturnType<typeof variantsOf>[number]

function hasValidVariant(variants: AssembledVariant[]): boolean {
  return variants.some((entry) => entry.consistency.isValid)
}

function clusteredAssignment(samples: LocatedSample[]): { assignment: ClassAssignment; variants: AssembledVariant[] } | null {
  const clustering = balancedClasses(samples, () => paletteChromaticities, false)
  const centers = centerIndexOfClass(samples)
  for (const references of centerMappings(clustering.features, clustering.classes, centers)) {
    const assignment = assignClasses(samples, clustering.features, references, true)
    const variants = variantsOf(samples, assignment)
    if (hasValidVariant(variants)) return { assignment: { ...assignment, balanced: true }, variants }
  }
  return null
}

export function assembleCube(firstShot: ShotDetection, secondShot: ShotDetection): AssembledCube {
  const samples = locatedSamples(firstShot, secondShot)
  const centers = centerIndexOfClass(samples)
  const fromCenters = balancedClasses(samples, (features) => centers.map((index) => features[index]), true)
  const centerVariants = variantsOf(samples, fromCenters)
  const clustered = hasValidVariant(centerVariants) ? null : clusteredAssignment(samples)
  const { classes, classCost, balanced } = clustered?.assignment ?? fromCenters
  const direct = clustered?.variants ?? centerVariants
  const variants = hasValidVariant(direct)
    ? direct
    : (() => {
        const swaps = cheapestSwaps(classes, classCost)
        const suspects = suspiciousStickers(classes, classCost)
        return direct.map((entry) => {
          const repaired = repairedFacelets(samples, classes, swaps, suspects, entry.variant)
          return repaired ? { facelets: repaired, variant: entry.variant, consistency: cubeConsistency(repaired), repaired: true } : entry
        })
      })()
  const ranked = [...variants].sort(
    (first, second) => second.consistency.score - first.consistency.score || first.variant - second.variant,
  )
  const candidates = ranked.map((entry) => entry.facelets)
  return { facelets: candidates[0], candidates, balanced: balanced || ranked[0].repaired }
}
