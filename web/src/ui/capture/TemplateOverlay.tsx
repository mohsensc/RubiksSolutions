import { motion } from 'framer-motion'
import type { PhotoFace, TemplateGeometry } from '../../vision'
import { cubeGreen } from './capturedShot'
import { gridLines, photoFaces, polygonPath, type Point } from './templateFit'

export type OverlayTone = 'idle' | 'searching' | 'ready'

interface TemplateOverlayProps {
  geometry: TemplateGeometry
  frameWidth: number
  frameHeight: number
  tone: OverlayTone
  dotColors?: Record<PhotoFace, string[]> | null
  dotPoints?: Record<PhotoFace, Point[]> | null
  fit?: 'cover' | 'contain'
  isDimmingOutside?: boolean
  handle?: { point: Point; radius: number } | null
  areDotsMuted?: boolean
  className?: string
}

const toneStroke: Record<OverlayTone, string> = {
  idle: 'rgb(236 235 230 / 0.55)',
  searching: 'rgb(236 235 230 / 0.85)',
  ready: cubeGreen,
}

function hexagonHeight(hexagon: Point[]): number {
  const ys = hexagon.map(([, y]) => y)
  return Math.max(...ys) - Math.min(...ys)
}

export function TemplateOverlay({
  geometry,
  frameWidth,
  frameHeight,
  tone,
  dotColors,
  dotPoints,
  fit = 'cover',
  isDimmingOutside = true,
  handle,
  areDotsMuted = false,
  className = '',
}: TemplateOverlayProps) {
  const dotRadius = hexagonHeight(geometry.hexagon) * 0.024
  const outline = polygonPath(geometry.hexagon)
  const isReady = tone === 'ready'
  const shapeTransition = { duration: isReady ? 0.28 : 0, ease: [0.2, 0.8, 0.2, 1] as const }
  return (
    <svg
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      preserveAspectRatio={fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}
      className={`pointer-events-none absolute inset-0 size-full ${className}`}
      aria-hidden
    >
      {isDimmingOutside && (
        <motion.path
          initial={false}
          animate={{ d: `M0 0 H${frameWidth} V${frameHeight} H0 Z ${outline}` }}
          transition={shapeTransition}
          fillRule="evenodd"
          fill="rgb(8 8 7 / 0.46)"
        />
      )}
      {photoFaces.map((face) => (
        <g key={face}>
          {gridLines(geometry.faces[face].polygon).map(([from, to], index) => (
            <motion.line
              key={index}
              initial={false}
              animate={{ x1: from[0], y1: from[1], x2: to[0], y2: to[1] }}
              transition={shapeTransition}
              stroke="rgb(236 235 230 / 0.2)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <motion.path
            initial={false}
            animate={{ d: polygonPath(geometry.faces[face].polygon) }}
            transition={shapeTransition}
            fill="none"
            stroke="rgb(236 235 230 / 0.42)"
            strokeWidth={1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
      <motion.path
        initial={false}
        fill="none"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        animate={{ d: outline, stroke: toneStroke[tone], strokeWidth: isReady ? 2.5 : 1.5 }}
        transition={{ duration: 0.25, d: shapeTransition }}
        style={{ filter: isReady ? `drop-shadow(0 0 6px ${cubeGreen})` : 'none' }}
      />
      {dotColors &&
        photoFaces.map((face) =>
          geometry.faces[face].cellCenters.map((cellCenter, index) => {
            const color = dotColors[face]?.[index]
            if (!color) return null
            const [x, y] = dotPoints?.[face]?.[index] ?? cellCenter
            return (
              <circle
                key={`${face}-${index}`}
                cx={x}
                cy={y}
                r={dotRadius}
                fill={color}
                fillOpacity={areDotsMuted ? 0.35 : 1}
                stroke="rgb(8 8 7 / 0.55)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )
          }),
        )}
      {handle && (
        <circle
          cx={handle.point[0]}
          cy={handle.point[1]}
          r={handle.radius}
          fill="rgb(12 12 11 / 0.9)"
          stroke={toneStroke[tone === 'ready' ? 'ready' : 'searching']}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
