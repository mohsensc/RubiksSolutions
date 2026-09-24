import { ContactShadows, Environment, Float, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import { MathUtils, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useReducedMotion } from '../ui/useReducedMotion'
import { RubiksCube } from './RubiksCube'

const cubeRadius = 2.75
const compactFillRatio = 0.6
const roomyFillRatio = 0.68
const portraitFillRatio = 0.82
const portraitAspectLimit = 0.75

function CameraFit() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null
  const viewportHeight = useThree((state) => state.size.height)
  const viewportWidth = useThree((state) => state.size.width)
  useEffect(() => {
    const isPortrait = viewportWidth / Math.max(1, viewportHeight) < portraitAspectLimit
    const isCompact = viewportHeight < 560 || viewportWidth < 520
    const fillRatio = isPortrait ? portraitFillRatio : isCompact ? compactFillRatio : roomyFillRatio
    const halfFovTangent = Math.tan(MathUtils.degToRad(camera.fov / 2))
    const aspect = Math.min(1, viewportWidth / Math.max(1, viewportHeight))
    const fittedDistance = cubeRadius / (fillRatio * halfFovTangent * aspect)
    camera.position.setLength(fittedDistance)
    if (controls) {
      controls.minDistance = fittedDistance * 0.7
      controls.maxDistance = fittedDistance * 1.6
      controls.update()
    }
  }, [camera, controls, viewportHeight, viewportWidth])
  return null
}

export function CubeStage() {
  const prefersReducedMotion = useReducedMotion()
  return (
    <Canvas
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
    </Canvas>
  )
}
