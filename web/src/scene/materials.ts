import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { faceColors, faceOrder, type FaceletChar } from '../cube/facelets'

export const cubieSize = 0.968

const stickerHalfSize = 0.372
const stickerCornerRadius = 0.11

function createStickerGeometry(): THREE.BufferGeometry {
  const inner = stickerHalfSize - stickerCornerRadius
  const shape = new THREE.Shape()
  shape.moveTo(-inner, -stickerHalfSize)
  shape.lineTo(inner, -stickerHalfSize)
  shape.quadraticCurveTo(stickerHalfSize, -stickerHalfSize, stickerHalfSize, -inner)
  shape.lineTo(stickerHalfSize, inner)
  shape.quadraticCurveTo(stickerHalfSize, stickerHalfSize, inner, stickerHalfSize)
  shape.lineTo(-inner, stickerHalfSize)
  shape.quadraticCurveTo(-stickerHalfSize, stickerHalfSize, -stickerHalfSize, inner)
  shape.lineTo(-stickerHalfSize, -inner)
  shape.quadraticCurveTo(-stickerHalfSize, -stickerHalfSize, -inner, -stickerHalfSize)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.004,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.014,
    bevelSegments: 3,
    curveSegments: 6,
  })
  geometry.translate(0, 0, -0.006)
  return geometry
}

export const cubieGeometry = new RoundedBoxGeometry(cubieSize, cubieSize, cubieSize, 4, 0.085)

export const stickerGeometry = createStickerGeometry()

export const cubieMaterial = new THREE.MeshPhysicalMaterial({
  color: '#0a0a0a',
  roughness: 0.38,
  metalness: 0,
  clearcoat: 0.35,
  clearcoatRoughness: 0.4,
})

function createStickerMaterial(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.44,
    metalness: 0,
    clearcoat: 0.22,
    clearcoatRoughness: 0.34,
    envMapIntensity: 0.8,
  })
}

export const stickerMaterials: Record<FaceletChar, THREE.MeshPhysicalMaterial> = {
  ...(Object.fromEntries(faceOrder.map((face) => [face, createStickerMaterial(faceColors[face])])) as Record<
    Exclude<FaceletChar, '?'>,
    THREE.MeshPhysicalMaterial
  >),
  '?': createStickerMaterial('#2c2c2a'),
}
