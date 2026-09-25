import { faceColors, type Face } from '../cube/facelets'
import type { Lab, Rgb } from './types'

export type StickerColor = 'white' | 'yellow' | 'red' | 'orange' | 'blue' | 'green'

export const stickerColors: readonly StickerColor[] = ['white', 'yellow', 'red', 'orange', 'blue', 'green']

export const westernFaceOfColor: Record<StickerColor, Face> = {
  white: 'U',
  red: 'R',
  green: 'F',
  yellow: 'D',
  orange: 'L',
  blue: 'B',
}

export const stickerCssColor: Record<StickerColor, string> = Object.fromEntries(
  stickerColors.map((color) => [color, faceColors[westernFaceOfColor[color]]]),
) as Record<StickerColor, string>

export type StickerPalette = Record<StickerColor, Lab>

export const defaultPalette: StickerPalette = {
  white: [86, 0, 4],
  yellow: [82, -4, 72],
  red: [44, 58, 36],
  orange: [62, 42, 62],
  blue: [40, 12, -52],
  green: [56, -50, 28],
}

const linearFromByte = new Float32Array(256)
for (let value = 0; value < 256; value++) {
  const channel = value / 255
  linearFromByte[value] = channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

const whiteX = 0.95047
const whiteZ = 1.08883
const labEpsilon = 216 / 24389
const labKappa = 24389 / 27

function labCurve(value: number): number {
  return value > labEpsilon ? Math.cbrt(value) : (labKappa * value + 16) / 116
}

export function linearChannel(byte: number): number {
  return linearFromByte[byte]
}

export function labFromLinear(red: number, green: number, blue: number): Lab {
  const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / whiteX
  const y = 0.2126729 * red + 0.7151522 * green + 0.072175 * blue
  const z = (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / whiteZ
  const fx = labCurve(x)
  const fy = labCurve(y)
  const fz = labCurve(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function labFromRgb(rgb: Rgb): Lab {
  return labFromLinear(linearFromByte[rgb[0]], linearFromByte[rgb[1]], linearFromByte[rgb[2]])
}

export function lightnessFromLinearLuminance(luminance: number): number {
  return 116 * labCurve(luminance) - 16
}

export function chroma(lab: Lab): number {
  return Math.hypot(lab[1], lab[2])
}

export function labDistance(first: Lab, second: Lab): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

const lightnessWeight = 0.5

export function stickerDistance(first: Lab, second: Lab): number {
  return Math.hypot((first[0] - second[0]) * lightnessWeight, first[1] - second[1], first[2] - second[2])
}

function inverseLabCurve(value: number): number {
  const cubed = value * value * value
  return cubed > labEpsilon ? cubed : (116 * value - 16) / labKappa
}

export function linearFromLab(lab: Lab): Rgb {
  const fy = (lab[0] + 16) / 116
  const fx = fy + lab[1] / 500
  const fz = fy - lab[2] / 200
  const x = inverseLabCurve(fx) * whiteX
  const y = inverseLabCurve(fy)
  const z = inverseLabCurve(fz) * whiteZ
  return [
    Math.max(0, 3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    Math.max(0, -0.969266 * x + 1.8760108 * y + 0.041556 * z),
    Math.max(0, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ]
}

export type Chromaticity = [number, number, number]

export function chromaticityFromLinear(linear: Rgb): Chromaticity {
  const total = Math.max(1e-6, linear[0] + linear[1] + linear[2])
  return [(100 * linear[0]) / total, (100 * linear[1]) / total, (100 * linear[2]) / total]
}

export function chromaticityDistance(first: Chromaticity, second: Chromaticity): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

const paletteChromaticityCache = new WeakMap<StickerPalette, Record<StickerColor, Chromaticity>>()

function paletteChromaticity(palette: StickerPalette): Record<StickerColor, Chromaticity> {
  const cached = paletteChromaticityCache.get(palette)
  if (cached) return cached
  const computed = Object.fromEntries(
    stickerColors.map((color) => [color, chromaticityFromLinear(linearFromLab(palette[color]))]),
  ) as Record<StickerColor, Chromaticity>
  paletteChromaticityCache.set(palette, computed)
  return computed
}

export function classifyColor(lab: Lab, palette: StickerPalette = defaultPalette): StickerColor {
  const references = paletteChromaticity(palette)
  const sample = chromaticityFromLinear(linearFromLab(lab))
  let bestColor: StickerColor = 'white'
  let bestDistance = Infinity
  for (const color of stickerColors) {
    const distance = chromaticityDistance(sample, references[color])
    if (distance < bestDistance) {
      bestDistance = distance
      bestColor = color
    }
  }
  return bestColor
}

export function adaptPalette(palette: StickerPalette, samples: readonly Lab[], blend = 0.5): StickerPalette {
  const adapted = { ...palette }
  for (const color of stickerColors) {
    const members = samples.filter((lab) => classifyColor(lab, palette) === color)
    if (members.length === 0) continue
    const mean = members
      .reduce<Lab>((sum, lab) => [sum[0] + lab[0], sum[1] + lab[1], sum[2] + lab[2]], [0, 0, 0])
      .map((value) => value / members.length) as Lab
    adapted[color] = palette[color].map((value, channel) => value * (1 - blend) + mean[channel] * blend) as Lab
  }
  return adapted
}
