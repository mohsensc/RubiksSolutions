import { useMemo } from 'react'
import { defaultTemplate, templateGeometry, type PhotoFace } from '../../vision'
import { photoFaces, polygonPath, type Point } from './templateFit'

const thumbnailFrame = 100

function useThumbnailGeometry() {
  return useMemo(() => {
    const geometry = templateGeometry(defaultTemplate(thumbnailFrame, thumbnailFrame), thumbnailFrame, thumbnailFrame)
    const xs = geometry.hexagon.map(([x]) => x)
    const ys = geometry.hexagon.map(([, y]) => y)
    const padding = 3
    const viewBox = [Math.min(...xs) - padding, Math.min(...ys) - padding, Math.max(...xs) - Math.min(...xs) + padding * 2, Math.max(...ys) - Math.min(...ys) + padding * 2]
    const cells = Object.fromEntries(
      photoFaces.map((face) => {
        const { polygon, cellCenters } = geometry.faces[face]
        const polygonCenter = polygon.reduce<Point>((sum, [x, y]) => [sum[0] + x / polygon.length, sum[1] + y / polygon.length], [0, 0])
        const shrink = 0.29
        return [
          face,
          cellCenters.map(([cellX, cellY]) =>
            polygonPath(polygon.map(([x, y]) => [cellX + (x - polygonCenter[0]) * shrink, cellY + (y - polygonCenter[1]) * shrink])),
          ),
        ]
      }),
    ) as Record<PhotoFace, string[]>
    return { geometry, viewBox: viewBox.join(' '), cells }
  }, [])
}

interface ShotThumbnailProps {
  colors?: Record<PhotoFace, string[]> | null
  size?: number
  className?: string
}

export function ShotThumbnail({ colors, size = 40, className = '' }: ShotThumbnailProps) {
  const { geometry, viewBox, cells } = useThumbnailGeometry()
  return (
    <svg viewBox={viewBox} width={size} height={size} className={className} aria-hidden>
      {photoFaces.map((face) =>
        colors ? (
          cells[face].map((cellPath, index) => <path key={`${face}-${index}`} d={cellPath} fill={colors[face][index] ?? 'transparent'} />)
        ) : (
          <path
            key={face}
            d={polygonPath(geometry.faces[face].polygon)}
            fill="rgb(236 235 230 / 0.07)"
            stroke="rgb(236 235 230 / 0.32)"
            strokeWidth={1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
    </svg>
  )
}
