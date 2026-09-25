import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Check, ImageUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { templateGeometry, type DetectOptions, type FrameTemplate, type ShotDetection } from '../../vision'
import { captureShot, detectionOptionsAfter, isSameSideAs, type CapturedShot } from './capturedShot'
import { FlipHint, FlipPillLabel, RoundIconButton, ShotSlot, StatusPill } from './CaptureControls'
import { createShotDetector, type ShotDetector } from './shotDetector'
import { ShotThumbnail } from './ShotThumbnail'
import { TemplateOverlay } from './TemplateOverlay'
import { fitTemplate, hexagonCenter, scaleTemplate, translateTemplate, type Point } from './templateFit'

const analysisLongSide = 1000
const initialTemplateFill = 0.72
const handleScreenRadius = 9
const handleHitRadius = 26
const keyboardStep = 8

interface LoadedImage {
  url: string
  width: number
  height: number
  pixels: ImageData
}

interface UploadViewProps {
  stepIndex: number
  firstShot: CapturedShot | null
  notice: string | null
  onCapture: (shot: CapturedShot) => void
  onSwitchToCamera: (() => void) | null
}

interface DetectionJob {
  image: LoadedImage
  template: FrameTemplate
  options: DetectOptions
}

type Gesture =
  | { kind: 'move'; pointerId: number; start: Point; template: FrameTemplate }
  | { kind: 'scale'; pointerId: number; startDistance: number; template: FrameTemplate }
  | { kind: 'pinch'; startDistance: number; startMidpoint: Point; template: FrameTemplate }

async function loadImage(file: File): Promise<LoadedImage | null> {
  const url = URL.createObjectURL(file)
  const element = new Image()
  element.src = url
  try {
    await element.decode()
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
  const ratio = Math.min(1, analysisLongSide / Math.max(element.naturalWidth, element.naturalHeight))
  const width = Math.max(1, Math.round(element.naturalWidth * ratio))
  const height = Math.max(1, Math.round(element.naturalHeight * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    URL.revokeObjectURL(url)
    return null
  }
  context.drawImage(element, 0, 0, width, height)
  return { url, width, height, pixels: context.getImageData(0, 0, width, height) }
}

function distance(from: Point, to: Point): number {
  return Math.hypot(to[0] - from[0], to[1] - from[1])
}

export function UploadView({ stepIndex, firstShot, notice, onCapture, onSwitchToCamera }: UploadViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [queuedFiles, setQueuedFiles] = useState<File[]>([])
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [isRejectedFile, setIsRejectedFile] = useState(false)
  const [template, setTemplate] = useState<FrameTemplate | null>(null)
  const [detection, setDetection] = useState<ShotDetection | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [shownImageUrl, setShownImageUrl] = useState<string | null>(null)
  const loadIdRef = useRef(0)
  const isMountedRef = useRef(true)
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 })
  const gestureRef = useRef<Gesture | null>(null)
  const pointersRef = useRef(new Map<number, Point>())
  const shownStepRef = useRef(stepIndex)
  const lastPlacementRef = useRef<{ template: FrameTemplate; aspect: number } | null>(null)
  const detectionOptions = useMemo(() => detectionOptionsAfter(firstShot), [firstShot])
  const detectorRef = useRef<ShotDetector | null>(null)
  const currentImageRef = useRef<LoadedImage | null>(null)
  const detectionQueueRef = useRef<{ isBusy: boolean; next: DetectionJob | null }>({ isBusy: false, next: null })
  currentImageRef.current = image

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      loadIdRef.current++
    }
  }, [])

  useEffect(() => {
    const detector = createShotDetector()
    const queue = detectionQueueRef.current
    detectorRef.current = detector
    return () => {
      detector.dispose()
      detectorRef.current = null
      queue.isBusy = false
      queue.next = null
    }
  }, [])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const observer = new ResizeObserver(([entry]) => setSurfaceSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(surface)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url)
  }, [image])

  const showFile = async (file: File) => {
    const loadId = ++loadIdRef.current
    const loaded = await loadImage(file)
    if (loadId !== loadIdRef.current || !isMountedRef.current) {
      if (loaded) URL.revokeObjectURL(loaded.url)
      return
    }
    setDetection(null)
    if (!loaded) {
      setImage(null)
      setTemplate(null)
      setIsRejectedFile(true)
      return
    }
    setIsRejectedFile(false)
    setImage(loaded)
    const previous = lastPlacementRef.current
    const hasSameShape = previous !== null && Math.abs(previous.aspect - loaded.width / loaded.height) < 0.01
    setTemplate(
      hasSameShape && previous
        ? previous.template
        : fitTemplate(loaded.width, loaded.height, { x: 0, y: 0, width: loaded.width, height: loaded.height }, initialTemplateFill),
    )
  }

  const acceptFiles = (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/') || file.type === '')
    if (images.length === 0) return
    const [first, ...rest] = images
    setQueuedFiles(rest.slice(0, 1 - stepIndex))
    void showFile(first)
  }

  useEffect(() => {
    if (shownStepRef.current === stepIndex) return
    shownStepRef.current = stepIndex
    loadIdRef.current++
    setImage(null)
    setTemplate(null)
    setDetection(null)
    const [next, ...rest] = queuedFiles
    setQueuedFiles(rest)
    if (next) void showFile(next)
  }, [stepIndex, queuedFiles])

  useEffect(() => {
    if (!image || !template) return
    const queue = detectionQueueRef.current
    const run = (job: DetectionJob) => {
      const detector = detectorRef.current
      if (!detector) return
      queue.isBusy = true
      const frame = new ImageData(new Uint8ClampedArray(job.image.pixels.data), job.image.width, job.image.height)
      detector
        .detect(frame, job.template, job.options)
        .then((result) => {
          if (currentImageRef.current === job.image) setDetection(result)
        })
        .catch(() => undefined)
        .finally(() => {
          queue.isBusy = false
          const next = queue.next
          queue.next = null
          if (next) run(next)
        })
    }
    const job: DetectionJob = { image, template, options: detectionOptions }
    if (queue.isBusy) queue.next = job
    else run(job)
  }, [image, template, detectionOptions])

  const geometry = useMemo(() => (image && template ? templateGeometry(template, image.width, image.height) : null), [image, template])
  const isSameSide = isSameSideAs(firstShot, detection)
  const isDetected = detection?.detected === true && !isSameSide
  const displayedGeometry = useMemo(
    () => (image && detection && isDetected ? templateGeometry(detection.alignedTemplate, image.width, image.height) : geometry),
    [image, detection, isDetected, geometry],
  )

  const screenScale = image && surfaceSize.width ? Math.min(surfaceSize.width / image.width, surfaceSize.height / image.height) : 1

  const handlePoint = useMemo<Point | null>(() => {
    if (!displayedGeometry) return null
    return displayedGeometry.hexagon.reduce((best, point) => (point[0] - point[1] > best[0] - best[1] ? point : best), displayedGeometry.hexagon[0])
  }, [displayedGeometry])

  const toFramePoint = (clientX: number, clientY: number): Point => {
    const surface = surfaceRef.current
    if (!surface || !image) return [0, 0]
    const box = surface.getBoundingClientRect()
    const offsetX = (box.width - image.width * screenScale) / 2
    const offsetY = (box.height - image.height * screenScale) / 2
    return [(clientX - box.left - offsetX) / screenScale, (clientY - box.top - offsetY) / screenScale]
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!image || !template) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = toFramePoint(event.clientX, event.clientY)
    pointersRef.current.set(event.pointerId, point)
    const pointers = [...pointersRef.current.values()]
    if (pointers.length >= 2) {
      gestureRef.current = {
        kind: 'pinch',
        startDistance: distance(pointers[0], pointers[1]) || 1,
        startMidpoint: [(pointers[0][0] + pointers[1][0]) / 2, (pointers[0][1] + pointers[1][1]) / 2],
        template,
      }
      return
    }
    const isOnHandle = handlePoint && distance(point, handlePoint) * screenScale < handleHitRadius
    gestureRef.current = isOnHandle
      ? { kind: 'scale', pointerId: event.pointerId, startDistance: distance(point, hexagonCenter(template, image.width, image.height)) || 1, template }
      : { kind: 'move', pointerId: event.pointerId, start: point, template }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || !image || !pointersRef.current.has(event.pointerId)) return
    const point = toFramePoint(event.clientX, event.clientY)
    pointersRef.current.set(event.pointerId, point)
    if (gesture.kind === 'move') {
      setTemplate(translateTemplate(gesture.template, point[0] - gesture.start[0], point[1] - gesture.start[1], image.width, image.height))
    } else if (gesture.kind === 'scale') {
      const center = hexagonCenter(gesture.template, image.width, image.height)
      setTemplate(scaleTemplate(gesture.template, distance(point, center) / gesture.startDistance, image.width, image.height))
    } else {
      const pointers = [...pointersRef.current.values()]
      if (pointers.length < 2) return
      const midpoint: Point = [(pointers[0][0] + pointers[1][0]) / 2, (pointers[0][1] + pointers[1][1]) / 2]
      const scaled = scaleTemplate(gesture.template, distance(pointers[0], pointers[1]) / gesture.startDistance, image.width, image.height)
      setTemplate(translateTemplate(scaled, midpoint[0] - gesture.startMidpoint[0], midpoint[1] - gesture.startMidpoint[1], image.width, image.height))
    }
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    const remaining = [...pointersRef.current.entries()]
    if (remaining.length === 1 && template) {
      const [pointerId, point] = remaining[0]
      gestureRef.current = { kind: 'move', pointerId, start: point, template }
      return
    }
    if (remaining.length === 0) gestureRef.current = null
  }

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !image) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      setTemplate((current) => (current ? scaleTemplate(current, Math.exp(-event.deltaY * 0.0015), image.width, image.height) : current))
    }
    surface.addEventListener('wheel', handleWheel, { passive: false })
    return () => surface.removeEventListener('wheel', handleWheel)
  }, [image])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!image || !template) return
    const step = keyboardStep / screenScale
    const moves: Record<string, Point> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (moves[event.key]) {
      event.preventDefault()
      setTemplate(translateTemplate(template, moves[event.key][0], moves[event.key][1], image.width, image.height))
    } else if (event.key === '+' || event.key === '=') {
      setTemplate(scaleTemplate(template, 1.05, image.width, image.height))
    } else if (event.key === '-') {
      setTemplate(scaleTemplate(template, 1 / 1.05, image.width, image.height))
    }
  }

  const pickFile = () => inputRef.current?.click()
  const isImageShown = image !== null && shownImageUrl === image.url
  const canUsePhoto = isDetected && isImageShown
  const visibleNotice = image ? null : notice
  const isNotDetected = (detection !== null && !detection.detected) || isRejectedFile

  return (
    <div className="absolute inset-0 flex flex-col bg-ground">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          acceptFiles(Array.from(event.currentTarget.files ?? []))
          event.currentTarget.value = ''
        }}
      />
      <div className="relative min-h-0 flex-1 px-4 pt-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] pb-3">
        <div
          ref={surfaceRef}
          className="relative size-full"
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragOver(false)
            acceptFiles(Array.from(event.dataTransfer.files))
          }}
        >
          <AnimatePresence mode="wait">
            {image && displayedGeometry ? (
              <motion.div
                key={image.url}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                onAnimationComplete={() => setShownImageUrl(image.url)}
                className="absolute inset-0"
              >
                <img src={image.url} alt="" className="absolute inset-0 size-full object-contain" draggable={false} />
                <TemplateOverlay
                  geometry={displayedGeometry}
                  frameWidth={image.width}
                  frameHeight={image.height}
                  fit="contain"
                  tone={isDetected ? 'ready' : 'searching'}
                  dotColors={detection?.previewColors ?? null}
                  dotPoints={detection?.detected ? detection.samplePoints : null}
                  areDotsMuted={!detection?.detected}
                  handle={handlePoint ? { point: handlePoint, radius: handleScreenRadius / screenScale } : null}
                />
                <div
                  role="application"
                  aria-label="Frame position. Drag to move, pinch or scroll to resize"
                  tabIndex={0}
                  onKeyDown={handleKeyDown}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
                  className="absolute inset-0 cursor-move touch-none rounded-xl"
                />
              </motion.div>
            ) : (
              <motion.button
                key="empty"
                type="button"
                onClick={pickFile}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                aria-label={`Choose photo ${stepIndex + 1} of 2`}
                className={`absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed transition-colors duration-150 hover:border-line-strong hover:bg-ink/[0.02] ${
                  isDragOver ? 'border-line-strong bg-ink/[0.03]' : 'border-line'
                }`}
              >
                {stepIndex === 1 ? <FlipHint size={88} /> : <ShotThumbnail size={88} />}
                <span className="flex items-center gap-2 text-muted">
                  <ImageUp size={16} strokeWidth={1.6} aria-hidden />
                  <span className="label">Choose photo</span>
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <StatusPill isVisible={isNotDetected || isSameSide || visibleNotice !== null}>
          {isNotDetected ? 'Cube faces not detected' : isSameSide ? <FlipPillLabel /> : visibleNotice}
        </StatusPill>
        <div className="grid w-full max-w-sm grid-cols-3 items-center">
          <div className="flex justify-start">
            {stepIndex === 1 ? <ShotSlot colors={firstShot?.colors} isAccepted /> : onSwitchToCamera ? <RoundIconButton icon={Camera} label="Camera" onClick={onSwitchToCamera} /> : <ShotSlot isAccepted={false} />}
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              disabled={!canUsePhoto || !detection}
              onClick={() => {
                if (!canUsePhoto || !detection || !image || !template) return
                lastPlacementRef.current = { template, aspect: image.width / image.height }
                onCapture(captureShot(detection))
              }}
              aria-label="Use photo"
              data-tip="Use photo"
              className="flex size-[60px] items-center justify-center rounded-full border border-line-strong text-ink transition-[background-color,border-color,transform,opacity] duration-200 enabled:border-transparent enabled:bg-ink enabled:text-ground active:scale-[0.95] disabled:opacity-35"
            >
              <Check size={22} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <div className="flex justify-end gap-2">
            {stepIndex === 1 && onSwitchToCamera && <RoundIconButton icon={Camera} label="Camera" onClick={onSwitchToCamera} />}
            <RoundIconButton icon={ImageUp} label={image ? 'Replace photo' : 'Choose photo'} onClick={pickFile} />
          </div>
        </div>
      </div>
    </div>
  )
}
