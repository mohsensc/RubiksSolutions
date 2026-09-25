import { solvedFacelets, type Face } from '../../cube/facelets'
import { applyMoves } from '../../cube/moves'
import { generateScramble } from '../../cube/scramble'
import type { FrameTemplate, ImageLike, Rgb } from '../types'
import {
  axisRotation,
  cameraStickerColors,
  cubeTurnX,
  cubeTurnY,
  cubeTurnZ,
  defaultScene,
  identityMatrix,
  imageFromPainter,
  multiplyMatrices,
  renderScene,
  roundedMatrix,
  seededRandom,
  type Matrix3,
} from './syntheticPhoto'

function turnSequence(turns: Matrix3[]): Matrix3 {
  return roundedMatrix(turns.reduce((matrix, turn) => multiplyMatrices(turn, matrix), identityMatrix))
}

export const firstShotPose = identityMatrix

export const secondShotPoses: Matrix3[] = [
  turnSequence([cubeTurnX, cubeTurnX, cubeTurnY]),
  turnSequence([cubeTurnX, cubeTurnX, cubeTurnZ, cubeTurnZ, cubeTurnZ]),
  turnSequence([cubeTurnX, cubeTurnY, cubeTurnY]),
]

export function randomCubeState(random: () => number): string {
  return applyMoves(solvedFacelets, generateScramble(25, random))
}

function jitteredColors(random: () => number, amount: number): Record<Face, Rgb> {
  return Object.fromEntries(
    Object.entries(cameraStickerColors).map(([face, color]) => [
      face,
      color.map((value) => Math.max(0, Math.min(255, value + (random() * 2 - 1) * amount))),
    ]),
  ) as Record<Face, Rgb>
}

export interface ShotScenario {
  image: ImageLike
  template: FrameTemplate
}

export function realisticShot(random: () => number, facelets: string, pose: Matrix3, seed: number, size = 320): ShotScenario {
  const tilt = axisRotation([random() - 0.5, random() - 0.5, random() - 0.5], (random() * 6 * Math.PI) / 180)
  const { image, template } = renderScene(
    defaultScene({
      facelets,
      width: size,
      height: size,
      cubeToWorld: multiplyMatrices(tilt, pose),
      hexagonRadiusFraction: 0.28 + random() * 0.1,
      centerOffset: [(random() - 0.5) * 0.06, (random() - 0.5) * 0.06],
      roll: (random() - 0.5) * 0.3,
      cameraDistance: 7 + random() * 5,
      exposure: 0.55 + random() * 0.85,
      whiteBalance: [0.82 + random() * 0.36, 0.9 + random() * 0.2, 0.82 + random() * 0.36],
      faceShading: [0.6 + random() * 0.45, 0.6 + random() * 0.45, 0.6 + random() * 0.45],
      glare:
        random() < 0.5
          ? { x: 0.3 + random() * 0.4, y: 0.3 + random() * 0.4, radius: 0.04 + random() * 0.06, strength: 0.2 + random() * 0.4 }
          : null,
      noise: random() * 8,
      blurRadius: random() < 0.5 ? 0 : 1,
      stickerHalfSize: 0.38 + random() * 0.07,
      background: random() < 0.5 ? 'clutter' : 'gradient',
      stickerColors: jitteredColors(random, 14),
      seed,
    }),
  )
  const angle = random() * Math.PI * 2
  const offset = Math.sqrt(random()) * 0.12
  const radiusPixels = template.size * Math.min(image.width, image.height)
  return {
    image,
    template: {
      centerX: template.centerX + (Math.cos(angle) * offset * radiusPixels) / image.width,
      centerY: template.centerY + (Math.sin(angle) * offset * radiusPixels) / image.height,
      size: template.size * (1 + (random() * 2 - 1) * 0.1),
      rotation: (template.rotation ?? 0) + ((random() * 2 - 1) * 8 * Math.PI) / 180,
    },
  }
}

export const negativeKinds = ['wall', 'blobs', 'hand', 'singleFace', 'tiles', 'wrongView', 'noise'] as const

export type NegativeKind = (typeof negativeKinds)[number]

export function negativeShot(kind: NegativeKind, seed: number, size = 320): ShotScenario {
  const random = seededRandom(seed)
  const template: FrameTemplate = { centerX: 0.5, centerY: 0.5, size: 0.34, rotation: 0 }
  const scale = size / 320
  const paint = (painter: (x: number, y: number) => Rgb, noise: number) =>
    imageFromPainter(size, size, (x, y) => painter(x / scale, y / scale), noise, seed)
  switch (kind) {
    case 'wall': {
      const base = [random() * 255, random() * 255, random() * 255]
      return { template, image: paint((x, y) => [base[0] + x * 0.1, base[1] + y * 0.08, base[2] - x * 0.05], random() * 6) }
    }
    case 'blobs': {
      const blobs = Array.from({ length: 30 }, () => ({
        x: random() * 320,
        y: random() * 320,
        radius: 10 + random() * 60,
        color: [random() * 255, random() * 255, random() * 255],
      }))
      return {
        template,
        image: paint((x, y) => {
          let color = [90, 90, 90]
          for (const blob of blobs) {
            const weight = Math.exp(-((x - blob.x) ** 2 + (y - blob.y) ** 2) / (blob.radius * blob.radius))
            color = color.map((value, channel) => value * (1 - weight) + blob.color[channel] * weight)
          }
          return color as Rgb
        }, 3),
      }
    }
    case 'hand': {
      const skin = [200 + random() * 40, 140 + random() * 40, 110 + random() * 40]
      return {
        template,
        image: paint((x, y) => {
          const isPalm = ((x - 160) / 90) ** 2 + ((y - 200) / 80) ** 2 < 1
          const isFinger = [0, 1, 2, 3].some((finger) => Math.abs(x - (100 + finger * 40)) < 14 && y > 50 && y < 200)
          const shade = 0.75 + 0.25 * Math.sin(x / 20)
          return (isPalm || isFinger ? skin.map((value) => value * shade) : [40, 45, 50]) as Rgb
        }, 4),
      }
    }
    case 'singleFace': {
      const faceOn = multiplyMatrices(axisRotation([-1, 1, 0], Math.acos(1 / Math.sqrt(3))), axisRotation([0, 0, 1], random() * Math.PI))
      const { image } = renderScene(
        defaultScene({ facelets: randomCubeState(random), width: size, height: size, cubeToWorld: faceOn, hexagonRadiusFraction: 0.3 + random() * 0.1, seed, noise: 3 }),
      )
      return { template, image }
    }
    case 'tiles': {
      const cell = 25 + random() * 30
      const palette = Object.values(cameraStickerColors)
      const colors = Array.from({ length: 200 }, () => palette[Math.floor(random() * palette.length)])
      const angle = random() * Math.PI
      return {
        template,
        image: paint((x, y) => {
          const u = (x * Math.cos(angle) + y * Math.sin(angle)) / cell + 50
          const v = (-x * Math.sin(angle) + y * Math.cos(angle)) / cell + 50
          if (u - Math.floor(u) < 0.1 || v - Math.floor(v) < 0.1) return [15, 15, 15]
          return colors[(Math.floor(u) * 7 + Math.floor(v) * 13) % colors.length]
        }, 3),
      }
    }
    case 'wrongView': {
      const axis: [number, number, number] = [random() - 0.5, random() - 0.5, random() - 0.5]
      const { image } = renderScene(
        defaultScene({
          facelets: randomCubeState(random),
          width: size,
          height: size,
          cubeToWorld: axisRotation(axis, ((25 + random() * 20) * Math.PI) / 180),
          seed,
          noise: 3,
          background: 'clutter',
        }),
      )
      return { template, image }
    }
    case 'noise':
      return { template, image: paint(() => [random() * 255, random() * 255, random() * 255], 0) }
  }
}
