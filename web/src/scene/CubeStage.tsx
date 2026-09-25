import { ContactShadows, Environment, Float, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef } from 'react'
import { MathUtils, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useCubeStore } from '../state/useCubeStore'
import { useReducedMotion } from '../ui/useReducedMotion'
import { RubiksCube } from './RubiksCube'

const cubeRadius = 2.75
const compactFillRatio = 0.8
const roomyFillRatio = 0.68
const portraitFillRatio = 0.82
const portraitAspectLimit = 0.75
const headerReserve = 60
const compactBannerReserve = 64
const roomyBannerReserve = 104
const idleBottomReserve = 8
const framingSmoothing = 9

interface Framing {
  distance: number
  offsetY: number
}

function framingFor(viewportWidth: number, viewportHeight: number, fov: number, hasBanner: boolean): Framing {
  const isRoomy = viewportWidth >= 700 && viewportHeight >= 700
  const bottomReserve = hasBanner ? (isRoomy ? roomyBannerReserve : compactBannerReserve) : idleBottomReserve
  const availableHeight = Math.max(1, viewportHeight - headerReserve - bottomReserve)
  const isPortrait = viewportWidth / Math.max(1, availableHeight) < portraitAspectLimit
  const isCompact = viewportHeight < 560 || viewportWidth < 520
  const fillRatio = isPortrait ? portraitFillRatio : isCompact ? compactFillRatio : roomyFillRatio
  const halfFovTangent = Math.tan(MathUtils.degToRad(fov / 2))
  const fittedSpan = Math.min(availableHeight, viewportWidth) / Math.max(1, viewportHeight)
  return {
    distance: cubeRadius / (fillRatio * halfFovTangent * fittedSpan),
    offsetY: (bottomReserve - headerReserve) / 2,
  }
}

function CameraFit() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null
  const invalidate = useThree((state) => state.invalidate)
  const viewportHeight = useThree((state) => state.size.height)
  const viewportWidth = useThree((state) => state.size.width)
  const hasBanner = useCubeStore((state) => (state.solution?.moves.length ?? 0) > 0)
  const targetRef = useRef<Framing | null>(null)
  const currentOffsetRef = useRef(0)
  const isSettlingRef = useRef(false)

  useEffect(() => {
    const target = framingFor(viewportWidth, viewportHeight, camera.fov, hasBanner)
    const isFirstFit = targetRef.current === null
    targetRef.current = target
    if (isFirstFit) {
      camera.position.setLength(target.distance)
      currentOffsetRef.current = target.offsetY
      camera.setViewOffset(viewportWidth, viewportHeight, 0, target.offsetY, viewportWidth, viewportHeight)
      if (controls) {
        controls.minDistance = target.distance * 0.7
        controls.maxDistance = target.distance * 1.6
        controls.update()
      }
      return
    }
    if (controls) {
      controls.minDistance = Math.min(controls.minDistance, target.distance * 0.7)
      controls.maxDistance = Math.max(controls.maxDistance, target.distance * 1.6)
    }
    isSettlingRef.current = true
    invalidate()
  }, [camera, controls, invalidate, viewportHeight, viewportWidth, hasBanner])

  useFrame((frameState, delta) => {
    const target = targetRef.current
    if (!target || !isSettlingRef.current) return
    frameState.invalidate()
    const blend = 1 - Math.exp(-framingSmoothing * Math.min(delta, 0.1))
    const currentDistance = camera.position.length()
    const nextDistance = MathUtils.lerp(currentDistance, target.distance, blend)
    const nextOffset = MathUtils.lerp(currentOffsetRef.current, target.offsetY, blend)
    const isSettled = Math.abs(nextDistance - target.distance) < 0.005 && Math.abs(nextOffset - target.offsetY) < 0.25
    camera.position.setLength(isSettled ? target.distance : nextDistance)
    currentOffsetRef.current = isSettled ? target.offsetY : nextOffset
    camera.setViewOffset(viewportWidth, viewportHeight, 0, currentOffsetRef.current, viewportWidth, viewportHeight)
    if (isSettled) {
      isSettlingRef.current = false
      if (controls) {
        controls.minDistance = target.distance * 0.7
        controls.maxDistance = target.distance * 1.6
      }
    }
    controls?.update()
  })
  return null
}

function RenderScheduler({ isIdleMotionActive }: { isIdleMotionActive: boolean }) {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => useCubeStore.subscribe(() => invalidate()), [invalidate])

  useEffect(() => {
    invalidate()
  }, [invalidate, isIdleMotionActive])

  useFrame((frameState) => {
    if (isIdleMotionActive) frameState.invalidate()
  })
  return null
}

function usePageGestureLock() {
  useEffect(() => {
    const preventGesture = (event: Event) => event.preventDefault()
    const preventMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault()
    }
    document.addEventListener('gesturestart', preventGesture)
    document.addEventListener('gesturechange', preventGesture)
    document.addEventListener('touchmove', preventMultiTouchZoom, { passive: false })
    return () => {
      document.removeEventListener('gesturestart', preventGesture)
      document.removeEventListener('gesturechange', preventGesture)
      document.removeEventListener('touchmove', preventMultiTouchZoom)
    }
  }, [])
}

export function CubeStage({ isCovered = false }: { isCovered?: boolean }) {
  const prefersReducedMotion = useReducedMotion()
  const isCustomizeOpen = useCubeStore((state) => state.isCustomizeOpen)
  const isIdleMotionActive = !prefersReducedMotion && !isCovered && !isCustomizeOpen
  usePageGestureLock()
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [8.8, 7, 11.4], fov: 28 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      className="touch-none"
      role="img"
      aria-label="3D cube. Drag stickers to turn faces, or press U R F D L B"
    >
      <Suspense fallback={null}>
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
          <Lightformer intensity={1.2} position={[-6, 1, 2]} rotation-y={Math.PI / 2} scale={[12, 3, 1]} />
          <Lightformer intensity={1} position={[6, 0, -2]} rotation-y={-Math.PI / 2} scale={[12, 3, 1]} />
          <Lightformer intensity={0.5} form="ring" position={[4, 5, 6]} scale={1.4} />
          <Lightformer intensity={0.6} position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} />
        </Environment>
      </Suspense>
      <directionalLight position={[4, 7, 5]} intensity={0.55} />
      <Float
        speed={prefersReducedMotion ? 0 : 1.4}
        rotationIntensity={prefersReducedMotion ? 0 : 0.28}
        floatIntensity={prefersReducedMotion ? 0 : 0.55}
        floatingRange={[-0.09, 0.09]}
      >
        <RubiksCube isMotionReduced={prefersReducedMotion} />
      </Float>
      <ContactShadows position={[0, -2.55, 0]} opacity={0.7} scale={10} blur={2.6} far={3.2} resolution={512} color="#000000" />
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={0.75} />
      <CameraFit />
      <RenderScheduler isIdleMotionActive={isIdleMotionActive} />
    </Canvas>
  )
}
