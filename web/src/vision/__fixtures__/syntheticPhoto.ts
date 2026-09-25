import { faceletIndexAt, type Vec3 } from '../../cube/geometry'
import type { Face } from '../../cube/facelets'
import type { FrameTemplate, ImageLike, Rgb } from '../types'

export type Matrix3 = [Vec3, Vec3, Vec3]

type MutableVec3 = [number, number, number]

function vectorFrom(build: (axis: number) => number): MutableVec3 {
  return [build(0), build(1), build(2)]
}

function matrixFrom(build: (row: number) => Vec3): Matrix3 {
  return [build(0), build(1), build(2)]
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export const identityMatrix: Matrix3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

export function multiplyMatrices(first: Matrix3, second: Matrix3): Matrix3 {
  const entry = (row: number, column: number) =>
    first[row][0] * second[0][column] + first[row][1] * second[1][column] + first[row][2] * second[2][column]
  return matrixFrom((row) => vectorFrom((column) => entry(row, column)))
}

export function transposeMatrix(matrix: Matrix3): Matrix3 {
  return matrixFrom((row) => vectorFrom((column) => matrix[column][row]))
}

export function applyMatrix(matrix: Matrix3, vector: Vec3): Vec3 {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ]
}

export function axisRotation(axis: Vec3, angle: number): Matrix3 {
  const length = Math.hypot(...axis)
  const [x, y, z] = axis.map((value) => value / length)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const complement = 1 - cosine
  return [
    [cosine + x * x * complement, x * y * complement - z * sine, x * z * complement + y * sine],
    [y * x * complement + z * sine, cosine + y * y * complement, y * z * complement - x * sine],
    [z * x * complement - y * sine, z * y * complement + x * sine, cosine + z * z * complement],
  ]
}

export const cubeTurnX = axisRotation([1, 0, 0], Math.PI / 2)
export const cubeTurnY = axisRotation([0, 1, 0], Math.PI / 2)
export const cubeTurnZ = axisRotation([0, 0, 1], Math.PI / 2)

export function roundedMatrix(matrix: Matrix3): Matrix3 {
  return matrixFrom((row) => vectorFrom((column) => Math.round(matrix[row][column]) + 0))
}

export const cameraStickerColors: Record<Face, Rgb> = {
  U: [232, 232, 226],
  R: [196, 28, 40],
  F: [18, 158, 84],
  D: [238, 212, 24],
  L: [246, 112, 22],
  B: [22, 78, 204],
}

export interface PhotoScene {
  facelets: string
  cubeToWorld: Matrix3
  width: number
  height: number
  hexagonRadiusFraction: number
  centerOffset: [number, number]
  roll: number
  cameraDistance: number
  exposure: number
  whiteBalance: Rgb
  faceShading: Vec3
  glare: { x: number; y: number; radius: number; strength: number } | null
  noise: number
  blurRadius: number
  stickerHalfSize: number
  plasticColor: Rgb
  background: 'gradient' | 'clutter'
  stickerColors: Record<Face, Rgb>
  seed: number
}

export function defaultScene(overrides: Partial<PhotoScene>): PhotoScene {
  return {
    facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB',
    cubeToWorld: identityMatrix,
    width: 320,
    height: 320,
    hexagonRadiusFraction: 0.34,
    centerOffset: [0, 0],
    roll: 0,
    cameraDistance: 11,
    exposure: 1,
    whiteBalance: [1, 1, 1],
    faceShading: [0.92, 1, 0.8],
    glare: null,
    noise: 0,
    blurRadius: 0,
    stickerHalfSize: 0.41,
    plasticColor: [16, 16, 18],
    background: 'gradient',
    stickerColors: cameraStickerColors,
    seed: 1,
    ...overrides,
  }
}

const cornerDirection: Vec3 = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]
const screenRight: Vec3 = [1 / Math.sqrt(2), 0, -1 / Math.sqrt(2)]
const screenUp: Vec3 = [-1 / Math.sqrt(6), 2 / Math.sqrt(6), -1 / Math.sqrt(6)]
const orthographicHexagonRadius = 1.5 * Math.sqrt(8 / 3)

function dot(first: Vec3, second: Vec3): number {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2]
}

function backgroundColor(scene: PhotoScene, x: number, y: number, clutter: ClutterRect[]): Rgb {
  const base: Rgb = [70 + (60 * y) / scene.height, 66 + (50 * x) / scene.width, 60 + (30 * (x + y)) / (scene.width + scene.height)]
  if (scene.background === 'clutter') {
    for (const rect of clutter) {
      if (x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height) return rect.color
    }
  }
  return base
}

interface ClutterRect {
  x: number
  y: number
  width: number
  height: number
  color: Rgb
}

function isInsideRoundedSquare(u: number, v: number, halfSize: number, cornerRadius: number): boolean {
  const du = Math.abs(u) - (halfSize - cornerRadius)
  const dv = Math.abs(v) - (halfSize - cornerRadius)
  if (du <= 0 || dv <= 0) return Math.abs(u) <= halfSize && Math.abs(v) <= halfSize
  return du * du + dv * dv <= cornerRadius * cornerRadius
}

export function renderScene(scene: PhotoScene): { image: ImageLike; template: FrameTemplate } {
  const random = seededRandom(scene.seed)
  const { width, height } = scene
  const shorterSide = Math.min(width, height)
  const centerX = width / 2 + scene.centerOffset[0] * shorterSide
  const centerY = height / 2 + scene.centerOffset[1] * shorterSide
  const radiusPixels = scene.hexagonRadiusFraction * shorterSide
  const focal = (radiusPixels * scene.cameraDistance) / orthographicHexagonRadius
  const worldToCube = transposeMatrix(scene.cubeToWorld)
  const cameraPosition = vectorFrom((axis) => cornerDirection[axis] * scene.cameraDistance)
  const rollCosine = Math.cos(scene.roll)
  const rollSine = Math.sin(scene.roll)
  const clutter: ClutterRect[] = Array.from({ length: 14 }, () => ({
    x: random() * width,
    y: random() * height,
    width: 20 + random() * 90,
    height: 20 + random() * 90,
    color: [random() * 255, random() * 255, random() * 255],
  }))
  const pixels = new Float32Array(width * height * 3)
  const faceNormalWorld = [0, 1, 2].map((axis) => vectorFrom((component) => (component === axis ? 1 : 0)))
  for (let pixelY = 0; pixelY < height; pixelY++) {
    for (let pixelX = 0; pixelX < width; pixelX++) {
      const screenX = pixelX + 0.5 - centerX
      const screenY = pixelY + 0.5 - centerY
      const unrolledX = rollCosine * screenX + rollSine * screenY
      const unrolledY = -rollSine * screenX + rollCosine * screenY
      const rayWorld = vectorFrom(
        (axis) => screenRight[axis] * unrolledX - screenUp[axis] * unrolledY - cornerDirection[axis] * focal,
      )
      const origin = applyMatrix(worldToCube, cameraPosition)
      const direction = applyMatrix(worldToCube, rayWorld)
      let entry = -Infinity
      let exit = Infinity
      let entryAxis = -1
      for (let axis = 0; axis < 3; axis++) {
        if (Math.abs(direction[axis]) < 1e-12) {
          if (Math.abs(origin[axis]) > 1.5) entry = Infinity
          continue
        }
        const first = (-1.5 - origin[axis]) / direction[axis]
        const second = (1.5 - origin[axis]) / direction[axis]
        const near = Math.min(first, second)
        const far = Math.max(first, second)
        if (near > entry) {
          entry = near
          entryAxis = axis
        }
        exit = Math.min(exit, far)
      }
      let color: Rgb
      if (entry < exit && entry > 0 && entryAxis >= 0) {
        const hit = vectorFrom((axis) => origin[axis] + direction[axis] * entry)
        const sign = Math.sign(hit[entryAxis])
        const normal = vectorFrom((axis) => (axis === entryAxis ? sign : 0))
        const tangentAxes = [0, 1, 2].filter((axis) => axis !== entryAxis)
        const cubie: MutableVec3 = [0, 0, 0]
        cubie[entryAxis] = sign
        const local: number[] = []
        for (const axis of tangentAxes) {
          const shifted = hit[axis] + 1.5
          const index = Math.min(2, Math.max(0, Math.floor(shifted)))
          cubie[axis] = index - 1
          local.push(shifted - index - 0.5)
        }
        const worldNormal = applyMatrix(scene.cubeToWorld, normal)
        const visibleAxis = faceNormalWorld.findIndex((axisNormal) => dot(axisNormal, worldNormal) > 0.5)
        const shading = visibleAxis >= 0 ? scene.faceShading[visibleAxis] : 0.6
        const isSticker = isInsideRoundedSquare(local[0], local[1], scene.stickerHalfSize, 0.1)
        const base = isSticker
          ? scene.stickerColors[scene.facelets[faceletIndexAt(cubie, normal)] as Face]
          : scene.plasticColor
        color = [base[0] * shading, base[1] * shading, base[2] * shading]
      } else {
        color = backgroundColor(scene, pixelX, pixelY, clutter)
      }
      const offset = (pixelY * width + pixelX) * 3
      pixels[offset] = color[0]
      pixels[offset + 1] = color[1]
      pixels[offset + 2] = color[2]
    }
  }
  const blurred = boxBlur(pixels, width, height, scene.blurRadius)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index++) {
    const x = index % width
    const y = Math.floor(index / width)
    let glare = 0
    if (scene.glare) {
      const distance = Math.hypot(x - scene.glare.x * width, y - scene.glare.y * height) / (scene.glare.radius * shorterSide)
      glare = scene.glare.strength * Math.exp(-distance * distance)
    }
    for (let channel = 0; channel < 3; channel++) {
      const linear = Math.pow(blurred[index * 3 + channel] / 255, 2.2) * scene.exposure * scene.whiteBalance[channel]
      const encoded = Math.pow(Math.min(1, linear), 1 / 2.2) * 255 + glare * 255
      const noise = scene.noise > 0 ? (random() + random() + random() - 1.5) * scene.noise * 2 : 0
      data[index * 4 + channel] = encoded + noise
    }
    data[index * 4 + 3] = 255
  }
  return {
    image: { width, height, data },
    template: {
      centerX: centerX / width,
      centerY: centerY / height,
      size: scene.hexagonRadiusFraction,
      rotation: scene.roll,
    },
  }
}

export function boxBlur(pixels: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return pixels
  const horizontal = new Float32Array(pixels.length)
  const result = new Float32Array(pixels.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0
        let count = 0
        for (let offset = -radius; offset <= radius; offset++) {
          const sampleX = Math.min(width - 1, Math.max(0, x + offset))
          sum += pixels[(y * width + sampleX) * 3 + channel]
          count++
        }
        horizontal[(y * width + x) * 3 + channel] = sum / count
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0
        let count = 0
        for (let offset = -radius; offset <= radius; offset++) {
          const sampleY = Math.min(height - 1, Math.max(0, y + offset))
          sum += horizontal[(sampleY * width + x) * 3 + channel]
          count++
        }
        result[(y * width + x) * 3 + channel] = sum / count
      }
    }
  }
  return result
}

export function imageFromPainter(width: number, height: number, paint: (x: number, y: number) => Rgb, noise = 0, seed = 7): ImageLike {
  const random = seededRandom(seed)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = paint(x, y)
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        data[offset + channel] = color[channel] + (noise > 0 ? (random() + random() + random() - 1.5) * noise * 2 : 0)
      }
      data[offset + 3] = 255
    }
  }
  return { width, height, data }
}
