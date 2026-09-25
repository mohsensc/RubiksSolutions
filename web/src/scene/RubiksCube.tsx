import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import type { FaceletChar } from '../cube/facelets'
import { cubiePositions, faceletPlacements, faceOfLayer, type Axis, type Vec3 } from '../cube/geometry'
import { applyMove, moveRotation, type Move } from '../cube/moves'
import { useCubeStore, type QueueItem } from '../state/useCubeStore'
import { cubieGeometry, cubieMaterial, cubieSize, stickerGeometry, stickerMaterials } from './materials'

const baseTurnSeconds = 0.3
const shuffleTurnSeconds = 0.085
const stateTransitionSeconds = 0.95
const reducedStateTransitionSeconds = 0.25
const nudgeSeconds = 0.32
const nudgeAngle = 0.07
const dragThresholdPixels = 12
const axisVectors = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
const stickerForward = new THREE.Vector3(0, 0, 1)
const rotationScratch = new THREE.Quaternion()
const pointerScratch = new THREE.Vector2()
const dragRaycaster = new THREE.Raycaster()

interface TurnAnimation {
  item: Extract<QueueItem, { kind: 'turn' }>
  elapsed: number
  duration: number
  axisVector: THREE.Vector3
  angle: number
  layerCubieIndices: number[]
  easing: (progress: number) => number
}

interface StateAnimation {
  item: Extract<QueueItem, { kind: 'set' }>
  elapsed: number
  duration: number
  hasPainted: boolean
}

type CubeAnimation = TurnAnimation | StateAnimation

interface Nudge {
  axis: Axis
  elapsed: number
}

interface DragGesture {
  faceletIndex: number
  startX: number
  startY: number
  hasTurned: boolean
}

const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3)
const easeInOutCubic = (progress: number) =>
  progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2

const stickerLayout = cubiePositions.map((cubie) =>
  faceletPlacements.flatMap((placement, faceletIndex) => {
    if (!placement.cubie.every((value, axis) => value === cubie[axis])) return []
    const normal = new THREE.Vector3(...placement.normal)
    return [
      {
        faceletIndex,
        position: normal.clone().multiplyScalar(cubieSize / 2),
        quaternion: new THREE.Quaternion().setFromUnitVectors(stickerForward, normal),
      },
    ]
  }),
)

function turnDuration(item: TurnAnimation['item'], speed: number, move: Move): number {
  const doubleTurnFactor = move.endsWith('2') ? 1.45 : 1
  if (item.origin === 'shuffle') return shuffleTurnSeconds * doubleTurnFactor
  const solutionFactor = item.origin === 'solution' ? 1.25 : 1
  return (baseTurnSeconds * solutionFactor * doubleTurnFactor) / speed
}

type DragResult = { kind: 'move'; move: Move } | { kind: 'slice'; axis: Axis } | null

function isCenterFacelet(faceletIndex: number): boolean {
  return faceletPlacements[faceletIndex].cubie.filter((value) => value !== 0).length === 1
}

function dragResultFor(faceletIndex: number, dragDirection: Vec3): DragResult {
  const placement = faceletPlacements[faceletIndex]
  const normal = new THREE.Vector3(...placement.normal)
  const rotationAxis = normal.clone().cross(new THREE.Vector3(...dragDirection))
  const axis = [0, 1, 2].find((index) => Math.abs(rotationAxis.getComponent(index)) > 0.5) as Axis | undefined
  if (axis === undefined) return null
  const rotationSign = Math.sign(rotationAxis.getComponent(axis))
  const layer = placement.cubie[axis]
  const face = faceOfLayer(axis, layer)
  if (!face) return { kind: 'slice', axis }
  return { kind: 'move', move: (rotationSign === -layer ? face : `${face}'`) as Move }
}

export function RubiksCube({ isMotionReduced }: { isMotionReduced: boolean }) {
  const rootRef = useRef<THREE.Group>(null)
  const cubieRefs = useRef<Array<THREE.Group | null>>([])
  const stickerRefs = useRef<Array<THREE.Mesh | null>>([])
  const displayedFaceletsRef = useRef(useCubeStore.getState().facelets)
  const animationRef = useRef<CubeAnimation | null>(null)
  const dragRef = useRef<DragGesture | null>(null)
  const nudgeRef = useRef<Nudge | null>(null)
  const isMotionReducedRef = useRef(isMotionReduced)
  isMotionReducedRef.current = isMotionReduced
  const camera = useThree((state) => state.camera)
  const canvas = useThree((state) => state.gl.domElement)
  const invalidate = useThree((state) => state.invalidate)

  const paintStickers = (facelets: string) => {
    stickerRefs.current.forEach((mesh, faceletIndex) => {
      if (mesh) mesh.material = stickerMaterials[facelets[faceletIndex] as FaceletChar] ?? stickerMaterials['?']
    })
  }

  useLayoutEffect(() => {
    paintStickers(displayedFaceletsRef.current)
  }, [])

  const resetCubie = (cubieIndex: number) => {
    const group = cubieRefs.current[cubieIndex]
    if (!group) return
    group.position.set(...cubiePositions[cubieIndex])
    group.quaternion.identity()
  }

  const startAnimation = (item: QueueItem): CubeAnimation => {
    if (item.kind === 'set') {
      const duration = isMotionReducedRef.current ? reducedStateTransitionSeconds : stateTransitionSeconds
      return { item, elapsed: 0, duration, hasPainted: false }
    }
    const { axis, layer, angle } = moveRotation(item.move)
    return {
      item,
      elapsed: 0,
      duration: turnDuration(item, useCubeStore.getState().speed, item.move),
      axisVector: axisVectors[axis],
      angle,
      layerCubieIndices: cubiePositions.flatMap((position, index) => (position[axis] === layer ? [index] : [])),
      easing: item.origin === 'solution' ? easeInOutCubic : easeOutCubic,
    }
  }

  const advanceNudge = (delta: number) => {
    const nudge = nudgeRef.current
    const root = rootRef.current
    if (!nudge || !root) return
    nudge.elapsed += delta
    const progress = Math.min(1, nudge.elapsed / nudgeSeconds)
    const angle = nudgeAngle * Math.sin(progress * Math.PI * 3) * (1 - progress)
    root.rotation.set(0, 0, 0)
    root.rotation[(['x', 'y', 'z'] as const)[nudge.axis]] = angle
    if (progress >= 1) {
      root.rotation.set(0, 0, 0)
      nudgeRef.current = null
    }
  }

  useFrame((frameState, delta) => {
    if (animationRef.current || nudgeRef.current || useCubeStore.getState().queue.length > 0) frameState.invalidate()
    let animation = animationRef.current
    if (!animation) {
      const nextItem = useCubeStore.getState().takeNextItem()
      if (!nextItem) {
        advanceNudge(Math.min(delta, 1 / 30))
        return
      }
      if (nudgeRef.current) {
        nudgeRef.current = null
        rootRef.current?.rotation.set(0, 0, 0)
      }
      animation = startAnimation(nextItem)
      animationRef.current = animation
    }
    animation.elapsed += Math.min(delta, 1 / 30)
    const progress = Math.min(1, animation.elapsed / animation.duration)

    if ('layerCubieIndices' in animation) {
      rotationScratch.setFromAxisAngle(animation.axisVector, animation.angle * animation.easing(progress))
      for (const cubieIndex of animation.layerCubieIndices) {
        const group = cubieRefs.current[cubieIndex]
        if (!group) continue
        group.position.set(...cubiePositions[cubieIndex]).applyQuaternion(rotationScratch)
        group.quaternion.copy(rotationScratch)
      }
      if (progress < 1) return
      animation.layerCubieIndices.forEach(resetCubie)
      const nextFacelets = applyMove(displayedFaceletsRef.current, animation.item.move)
      displayedFaceletsRef.current = nextFacelets
      paintStickers(nextFacelets)
      animationRef.current = null
      useCubeStore.getState().completeItem(animation.item, nextFacelets)
      return
    }

    const root = rootRef.current
    if (!root) return
    const eased = easeInOutCubic(progress)
    const pulse = Math.sin(progress * Math.PI)
    if (isMotionReducedRef.current) {
      root.scale.setScalar(1 - pulse * 0.04)
    } else {
      root.rotation.set(pulse * 0.35, eased * Math.PI * 2, 0)
      root.scale.setScalar(1 - pulse * 0.12)
    }
    if (progress >= 0.5 && !animation.hasPainted) {
      animation.hasPainted = true
      displayedFaceletsRef.current = animation.item.facelets
      paintStickers(animation.item.facelets)
    }
    if (progress < 1) return
    root.rotation.set(0, 0, 0)
    root.scale.setScalar(1)
    animationRef.current = null
    useCubeStore.getState().completeItem(animation.item, animation.item.facelets)
  })

  useEffect(() => {
    const eventSource = canvas.parentElement ?? canvas

    const projectToScreen = (localPoint: THREE.Vector3) => {
      const root = rootRef.current
      if (!root) return null
      const projected = root.localToWorld(localPoint.clone()).project(camera)
      const bounds = canvas.getBoundingClientRect()
      return new THREE.Vector2((projected.x * bounds.width) / 2, (-projected.y * bounds.height) / 2)
    }

    const stickerUnderPointer = (event: PointerEvent): number | null => {
      const bounds = canvas.getBoundingClientRect()
      pointerScratch.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      )
      dragRaycaster.setFromCamera(pointerScratch, camera)
      const stickerMeshes = stickerRefs.current.filter((mesh): mesh is THREE.Mesh => mesh !== null)
      const cubieMeshes = cubieRefs.current.flatMap((group) => (group ? [group.children[0]] : []))
      const [nearestHit] = dragRaycaster.intersectObjects([...stickerMeshes, ...cubieMeshes], false)
      if (!nearestHit) return null
      const faceletIndex = nearestHit.object.userData.faceletIndex
      return typeof faceletIndex === 'number' ? faceletIndex : nearestFaceletOfCubie(nearestHit)
    }

    const nearestFaceletOfCubie = (hit: THREE.Intersection): number | null => {
      const cubieIndex = cubieRefs.current.findIndex((group) => group?.children[0] === hit.object)
      if (cubieIndex < 0 || !hit.face) return null
      const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      const localNormal = worldNormal.transformDirection(rootRef.current!.matrixWorld.clone().invert())
      const candidates = stickerLayout[cubieIndex]
      let bestFacelet: number | null = null
      let bestAlignment = 0.6
      for (const sticker of candidates) {
        const alignment = new THREE.Vector3(...faceletPlacements[sticker.faceletIndex].normal).dot(localNormal)
        if (alignment > bestAlignment) {
          bestAlignment = alignment
          bestFacelet = sticker.faceletIndex
        }
      }
      return bestFacelet
    }

    const resolveDrag = (gesture: DragGesture, dragX: number, dragY: number): DragResult => {
      const placement = faceletPlacements[gesture.faceletIndex]
      const normal = new THREE.Vector3(...placement.normal)
      const stickerCenter = new THREE.Vector3(...placement.cubie).addScaledVector(normal, 0.5)
      const screenCenter = projectToScreen(stickerCenter)
      if (!screenCenter) return null
      const dragVector = new THREE.Vector2(dragX, dragY).normalize()
      const normalAxis = placement.normal.findIndex((value) => value !== 0)
      let bestDirection: Vec3 | null = null
      let bestAlignment = -Infinity
      for (const tangentAxis of [0, 1, 2]) {
        if (tangentAxis === normalAxis) continue
        for (const sign of [1, -1]) {
          const direction = [0, 1, 2].map((index) => (index === tangentAxis ? sign : 0)) as unknown as Vec3
          const screenTip = projectToScreen(stickerCenter.clone().add(new THREE.Vector3(...direction).multiplyScalar(0.5)))
          if (!screenTip) continue
          const screenDirection = screenTip.sub(screenCenter)
          if (screenDirection.lengthSq() < 1e-6) continue
          const alignment = screenDirection.normalize().dot(dragVector)
          if (alignment > bestAlignment) {
            bestAlignment = alignment
            bestDirection = direction
          }
        }
      }
      if (!bestDirection || bestAlignment < 0.5) return null
      return dragResultFor(gesture.faceletIndex, bestDirection)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return
      const faceletIndex = stickerUnderPointer(event)
      if (faceletIndex === null || isCenterFacelet(faceletIndex)) return
      event.stopPropagation()
      dragRef.current = { faceletIndex, startX: event.clientX, startY: event.clientY, hasTurned: false }
    }

    const handleHover = (event: PointerEvent) => {
      if (dragRef.current || event.pointerType !== 'mouse') return
      const hoveredFacelet = stickerUnderPointer(event)
      canvas.style.cursor = hoveredFacelet === null || isCenterFacelet(hoveredFacelet) ? '' : 'grab'
    }

    const handleHoverEnd = () => {
      canvas.style.cursor = ''
    }

    const handleDragMove = (event: PointerEvent) => {
      const gesture = dragRef.current
      if (!gesture || gesture.hasTurned) return
      const dragX = event.clientX - gesture.startX
      const dragY = event.clientY - gesture.startY
      if (Math.hypot(dragX, dragY) < dragThresholdPixels) return
      gesture.hasTurned = true
      const result = resolveDrag(gesture, dragX, dragY)
      if (result?.kind === 'move') useCubeStore.getState().userMove(result.move)
      else if (result?.kind === 'slice' && !animationRef.current) {
        nudgeRef.current = { axis: result.axis, elapsed: 0 }
        invalidate()
      }
    }

    const handlePointerEnd = () => {
      dragRef.current = null
    }

    eventSource.addEventListener('pointerdown', handlePointerDown, { capture: true })
    eventSource.addEventListener('pointermove', handleHover)
    eventSource.addEventListener('pointerleave', handleHoverEnd)
    window.addEventListener('pointermove', handleDragMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
    return () => {
      eventSource.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      eventSource.removeEventListener('pointermove', handleHover)
      eventSource.removeEventListener('pointerleave', handleHoverEnd)
      window.removeEventListener('pointermove', handleDragMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }
  }, [camera, canvas, invalidate])

  return (
    <group ref={rootRef}>
      {cubiePositions.map((position, cubieIndex) => (
        <group
          key={position.join(',')}
          position={position as unknown as THREE.Vector3Tuple}
          ref={(group) => {
            cubieRefs.current[cubieIndex] = group
          }}
        >
          <mesh geometry={cubieGeometry} material={cubieMaterial} />
          {stickerLayout[cubieIndex].map((sticker) => (
            <mesh
              key={sticker.faceletIndex}
              geometry={stickerGeometry}
              material={stickerMaterials['?']}
              position={sticker.position}
              quaternion={sticker.quaternion}
              userData={{ faceletIndex: sticker.faceletIndex }}
              ref={(mesh) => {
                stickerRefs.current[sticker.faceletIndex] = mesh
              }}
            />
          ))}
        </group>
      ))}
    </group>
  )
}
