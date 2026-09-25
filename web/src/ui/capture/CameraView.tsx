import { AnimatePresence, motion } from 'framer-motion'
import { ImageUp } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { stableDetectionTracker, templateGeometry, type ShotDetection } from '../../vision'
import { captureShot, cubeGreen, detectionOptionsAfter, isSameSideAs, type CapturedShot } from './capturedShot'
import { FlipHint, FlipPillLabel, RoundIconButton, ShotSlot, StatusPill } from './CaptureControls'
import { liveAnalysisSize, type FrameSize } from './liveAnalysis'
import { createShotDetector, type ShotDetector } from './shotDetector'
import { TemplateOverlay } from './TemplateOverlay'
import { coverVisibleRect, fitTemplate, type FrameRect } from './templateFit'

const analysisIntervalMs = 100
const stableDetectionMs = 500
const notDetectedGraceMs = 700
const templateFill = 0.92
const missedCaptureNoticeMs = 1600

interface CameraViewProps {
  stepIndex: number
  firstShot: CapturedShot | null
  onCapture: (shot: CapturedShot) => void
  onUnavailable: () => void
  onSwitchToUpload: () => void
}

interface LiveState {
  detection: ShotDetection | null
  readyDetection: ShotDetection | null
  isReady: boolean
  isSameSide: boolean
}

const emptyLiveState: LiveState = { detection: null, readyDetection: null, isReady: false, isSameSide: false }

function useElementRect(element: HTMLElement | null, container: HTMLElement | null): FrameRect | null {
  const [rect, setRect] = useState<FrameRect | null>(null)
  useLayoutEffect(() => {
    if (!element || !container) return
    const measure = () => {
      const elementBox = element.getBoundingClientRect()
      const containerBox = container.getBoundingClientRect()
      setRect({ x: elementBox.left - containerBox.left, y: elementBox.top - containerBox.top, width: elementBox.width, height: elementBox.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observer.observe(container)
    return () => observer.disconnect()
  }, [element, container])
  return rect
}

function frameTargetRect(videoSize: FrameSize, container: HTMLElement, targetOnScreen: FrameRect, frame: FrameSize): FrameRect {
  const containerBox = container.getBoundingClientRect()
  const { toFrame } = coverVisibleRect(videoSize.width, videoSize.height, containerBox.width, containerBox.height)
  const inVideo = toFrame(targetOnScreen)
  const ratio = frame.width / videoSize.width
  return { x: inVideo.x * ratio, y: inVideo.y * ratio, width: inVideo.width * ratio, height: inVideo.height * ratio }
}

export function CameraView({ stepIndex, firstShot, onCapture, onUnavailable, onSwitchToUpload }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [targetArea, setTargetArea] = useState<HTMLDivElement | null>(null)
  const targetOnScreen = useElementRect(targetArea, container)
  const [videoSize, setVideoSize] = useState<FrameSize | null>(null)
  const [live, setLive] = useState<LiveState>(emptyLiveState)
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [flashKey, setFlashKey] = useState(0)
  const [missedCaptureAt, setMissedCaptureAt] = useState<number | null>(null)
  const [isHintVisible, setIsHintVisible] = useState(stepIndex === 1)
  const detectionOptions = useMemo(() => detectionOptionsAfter(firstShot), [firstShot])
  const firstShotRef = useRef(firstShot)
  firstShotRef.current = firstShot
  const onUnavailableRef = useRef(onUnavailable)
  onUnavailableRef.current = onUnavailable
  const detectorRef = useRef<ShotDetector | null>(null)
  const isCapturingRef = useRef(false)

  useEffect(() => {
    const detector = createShotDetector()
    detectorRef.current = detector
    return () => {
      detector.dispose()
      detectorRef.current = null
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let stream: MediaStream | null = null
    let isActive = true
    let latestStartId = 0
    const stop = () => {
      latestStartId++
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      video.srcObject = null
      setStreamStartedAt(null)
    }
    const start = async () => {
      const startId = ++latestStartId
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        })
        if (!isActive || document.hidden || startId !== latestStartId) {
          nextStream.getTracks().forEach((track) => track.stop())
          return
        }
        stream = nextStream
        video.srcObject = nextStream
        await video.play().catch(() => undefined)
      } catch {
        if (isActive && startId === latestStartId) onUnavailableRef.current()
      }
    }
    const handleVisibilityChange = () => {
      if (document.hidden) stop()
      else if (!stream) void start()
    }
    void start()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      isActive = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stop()
    }
  }, [])

  const handleVideoReady = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    setVideoSize({ width: video.videoWidth, height: video.videoHeight })
    setStreamStartedAt(performance.now())
  }

  const analysisSize = useMemo<FrameSize | null>(() => (videoSize ? liveAnalysisSize(videoSize) : null), [videoSize])

  const analysisTemplate = useMemo(() => {
    if (!videoSize || !analysisSize || !container || !targetOnScreen) return null
    return fitTemplate(analysisSize.width, analysisSize.height, frameTargetRect(videoSize, container, targetOnScreen, analysisSize), templateFill)
  }, [videoSize, analysisSize, container, targetOnScreen])

  const geometry = useMemo(
    () => (analysisTemplate && analysisSize ? templateGeometry(analysisTemplate, analysisSize.width, analysisSize.height) : null),
    [analysisTemplate, analysisSize],
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video || !analysisTemplate || !analysisSize) return
    const canvas = document.createElement('canvas')
    canvas.width = analysisSize.width
    canvas.height = analysisSize.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const tracker = stableDetectionTracker(stableDetectionMs)
    let frameId = 0
    let lastRunAt = 0
    let isAnalyzing = false
    let isActive = true
    const applyDetection = (detection: ShotDetection) => {
      const timestamp = performance.now()
      const isSameSide = isSameSideAs(firstShotRef.current, detection)
      const isReady = tracker.update(isSameSide ? { ...detection, detected: false } : detection, timestamp) && detection.detected && !isSameSide
      setLive({ detection, readyDetection: isReady ? detection : null, isReady, isSameSide })
      setNow(timestamp)
    }
    const tick = (timestamp: number) => {
      frameId = requestAnimationFrame(tick)
      const detector = detectorRef.current
      if (!detector || isAnalyzing || timestamp - lastRunAt < analysisIntervalMs || video.readyState < 2) return
      lastRunAt = timestamp
      context.drawImage(video, 0, 0, analysisSize.width, analysisSize.height)
      isAnalyzing = true
      detector
        .detect(context.getImageData(0, 0, analysisSize.width, analysisSize.height), analysisTemplate, detectionOptions)
        .then((detection) => {
          if (isActive) applyDetection(detection)
        })
        .catch(() => undefined)
        .finally(() => {
          isAnalyzing = false
        })
    }
    frameId = requestAnimationFrame(tick)
    return () => {
      isActive = false
      cancelAnimationFrame(frameId)
      setLive(emptyLiveState)
    }
  }, [analysisTemplate, analysisSize, detectionOptions])

  useEffect(() => {
    if (stepIndex !== 1) return
    setIsHintVisible(true)
    const timer = window.setTimeout(() => setIsHintVisible(false), 2200)
    return () => window.clearTimeout(timer)
  }, [stepIndex])

  const capture = useCallback(async () => {
    const video = videoRef.current
    const detector = detectorRef.current
    if (!video || !detector || isCapturingRef.current || !live.isReady || !live.readyDetection || !container || !targetOnScreen || !videoSize) return
    isCapturingRef.current = true
    const fullSize = { width: video.videoWidth, height: video.videoHeight }
    const canvas = document.createElement('canvas')
    canvas.width = fullSize.width
    canvas.height = fullSize.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const isUsable = (candidate: ShotDetection | null): candidate is ShotDetection =>
      candidate !== null && candidate.detected && !isSameSideAs(firstShotRef.current, candidate)
    const liveDetection = isUsable(live.detection) ? live.detection : null
    let detection: ShotDetection | null = null
    if (context) {
      context.drawImage(video, 0, 0, fullSize.width, fullSize.height)
      const fullTemplate = fitTemplate(fullSize.width, fullSize.height, frameTargetRect(videoSize, container, targetOnScreen, fullSize), templateFill)
      const fullDetection = await detector.detect(context.getImageData(0, 0, fullSize.width, fullSize.height), fullTemplate, detectionOptions).catch(() => null)
      detection = isUsable(fullDetection) ? fullDetection : liveDetection
    } else {
      detection = liveDetection
    }
    isCapturingRef.current = false
    if (detectorRef.current !== detector) return
    if (!detection) {
      const missedAt = performance.now()
      setMissedCaptureAt(missedAt)
      setNow(missedAt)
      return
    }
    setMissedCaptureAt(null)
    setFlashKey((key) => key + 1)
    onCapture(captureShot(detection))
  }, [live, container, targetOnScreen, videoSize, onCapture, detectionOptions])

  const isWarm = streamStartedAt !== null && now - streamStartedAt > notDetectedGraceMs
  const isCaptureMissed = missedCaptureAt !== null && now - missedCaptureAt < missedCaptureNoticeMs
  const isNotDetected = isCaptureMissed || (isWarm && live.detection !== null && !live.detection.detected)
  const tone = live.isReady ? 'ready' : live.detection?.detected && !live.isSameSide ? 'searching' : 'idle'
  const lockedDetection = live.isReady && live.detection?.detected && !live.isSameSide ? live.detection : null
  const displayedGeometry = useMemo(
    () => (lockedDetection && analysisSize ? templateGeometry(lockedDetection.alignedTemplate, analysisSize.width, analysisSize.height) : geometry),
    [lockedDetection, analysisSize, geometry],
  )

  return (
    <div ref={setContainer} className="absolute inset-0 overflow-hidden bg-ground">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        onLoadedMetadata={handleVideoReady}
        onResize={handleVideoReady}
        className="absolute inset-0 size-full object-cover"
      />
      {displayedGeometry && analysisSize && (
        <TemplateOverlay
          geometry={displayedGeometry}
          frameWidth={analysisSize.width}
          frameHeight={analysisSize.height}
          tone={tone}
          dotColors={live.detection?.previewColors ?? null}
          dotPoints={live.detection?.detected ? live.detection.samplePoints : null}
          areDotsMuted={!live.detection?.detected}
        />
      )}
      <AnimatePresence>
        {flashKey > 0 && (
          <motion.div
            key={flashKey}
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="pointer-events-none absolute inset-0 bg-ink"
          />
        )}
      </AnimatePresence>

      <div className="absolute inset-x-0 top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] bottom-[calc(max(1rem,env(safe-area-inset-bottom))+9rem)] px-4">
        <div ref={setTargetArea} className="size-full" />
      </div>

      <AnimatePresence>
        {isHintVisible && (
          <motion.div
            key="flip-hint"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="flex items-center gap-4 rounded-2xl border border-line bg-ground/80 p-4 backdrop-blur-md">
              <ShotSlot colors={firstShot?.colors} isAccepted />
              <FlipHint size={64} />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <StatusPill isVisible={isNotDetected || (live.isSameSide && !isHintVisible)}>
          {live.isSameSide && !isCaptureMissed ? <FlipPillLabel /> : 'Cube faces not detected'}
        </StatusPill>
        <div className="grid w-full max-w-sm grid-cols-3 items-center">
          <div className="flex justify-start">
            {stepIndex === 1 ? <ShotSlot colors={firstShot?.colors} isAccepted /> : <ShotSlot isAccepted={false} />}
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void capture()}
              disabled={!live.isReady}
              aria-label="Take photo"
              className="group flex size-[72px] items-center justify-center rounded-full border-[3px] transition-[border-color,transform] duration-200 active:scale-[0.94] disabled:cursor-not-allowed"
              style={{ borderColor: live.isReady ? cubeGreen : 'rgb(236 235 230 / 0.28)' }}
            >
              <motion.span
                animate={{ scale: live.isReady ? 1 : 0.86, opacity: live.isReady ? 1 : 0.3 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className="block size-[56px] rounded-full bg-ink"
              />
            </button>
          </div>
          <div className="flex justify-end">
            <RoundIconButton icon={ImageUp} label="Upload photo" onClick={onSwitchToUpload} />
          </div>
        </div>
      </div>
    </div>
  )
}
