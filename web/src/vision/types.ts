export interface ImageLike {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

export interface FrameTemplate {
  centerX: number
  centerY: number
  size: number
  rotation?: number
  tiltX?: number
  tiltY?: number
}

export type PhotoFace = 'top' | 'left' | 'right'

export const photoFaces: readonly PhotoFace[] = ['top', 'left', 'right']

export type Point = [number, number]

export type CornerPoint = readonly [number, number, number]

export type Lab = [number, number, number]

export type Rgb = [number, number, number]

export interface StickerSample {
  lab: Lab
  rgb: Rgb
  variance: number
}

export type DetectionReason = 'notStickers' | 'noGrid' | 'sameCenters' | 'implausibleColors' | 'lowConfidence'

export interface ShotDetection {
  detected: boolean
  confidence: number
  reason?: DetectionReason
  faces: Record<PhotoFace, StickerSample[]>
  previewColors: Record<PhotoFace, string[]>
  alignedTemplate: FrameTemplate
  samplePoints: Record<PhotoFace, Point[]>
}

export interface FaceGeometry {
  polygon: Point[]
  cellCenters: Point[]
}

export interface TemplateGeometry {
  hexagon: Point[]
  faces: Record<PhotoFace, FaceGeometry>
}
