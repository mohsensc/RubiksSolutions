import { AnimatePresence, motion } from 'framer-motion'
import { Paintbrush, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCubeStore } from '../../state/useCubeStore'
import { useMediaQuery } from '../useMediaQuery'
import { assembleCapturedCube } from './assembleCapturedCube'
import { CameraView } from './CameraView'
import { CaptureReview } from './CaptureReview'
import { hasCameraSupport, type CapturedShot } from './capturedShot'
import { RoundIconButton, StepLabel } from './CaptureControls'
import { UploadView } from './UploadView'
import { useCaptureStore } from './useCaptureStore'

type CaptureSource = 'camera' | 'upload'

type CapturePhase = { kind: 'shooting' } | { kind: 'checking' } | { kind: 'review'; facelets: string }

function useRootInert(isInert: boolean) {
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root || !isInert) return
    root.setAttribute('inert', '')
    return () => root.removeAttribute('inert')
  }, [isInert])
}

function CaptureBody({ onClose }: { onClose: () => void }) {
  const isMobileLayout = !useMediaQuery('(min-width: 1024px)')
  const [isCameraBlocked, setIsCameraBlocked] = useState(false)
  const canUseCamera = isMobileLayout && hasCameraSupport() && !isCameraBlocked
  const [preferredSource, setPreferredSource] = useState<CaptureSource>('camera')
  const source: CaptureSource = canUseCamera ? preferredSource : 'upload'
  const [shots, setShots] = useState<CapturedShot[]>([])
  const [phase, setPhase] = useState<CapturePhase>({ kind: 'shooting' })
  const applyCustomFacelets = useCubeStore((state) => state.applyCustomFacelets)
  const openCustomizeWith = useCubeStore((state) => state.openCustomizeWith)
  const setCustomizeOpen = useCubeStore((state) => state.setCustomizeOpen)
  const isActiveRef = useRef(true)
  const stepIndex = Math.min(shots.length, 1)
  const firstShot = shots[0] ?? null

  useEffect(() => {
    isActiveRef.current = true
    return () => {
      isActiveRef.current = false
    }
  }, [])

  const handleCapture = useCallback(
    (shot: CapturedShot) => {
      const nextShots = [...shots, shot]
      setShots(nextShots)
      if (nextShots.length < 2) return
      setPhase({ kind: 'checking' })
      void assembleCapturedCube(nextShots[0], nextShots[1])
        .then((outcome) => {
          if (!isActiveRef.current) return
          if (outcome.kind === 'valid') {
            setPhase({ kind: 'review', facelets: outcome.facelets })
            return
          }
          onClose()
          openCustomizeWith(outcome.facelets)
        })
        .catch(() => {
          if (!isActiveRef.current) return
          setShots([])
          setPhase({ kind: 'shooting' })
        })
    },
    [shots, onClose, openCustomizeWith],
  )

  const paintByHand = () => {
    onClose()
    setCustomizeOpen(true)
  }

  const retake = () => {
    setShots([])
    setPhase({ kind: 'shooting' })
  }

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {phase.kind === 'review' ? (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
            <CaptureReview
              facelets={phase.facelets}
              onRetake={retake}
              onUse={() => {
                applyCustomFacelets(phase.facelets)
                onClose()
              }}
              onEdit={() => {
                onClose()
                openCustomizeWith(phase.facelets)
              }}
            />
          </motion.div>
        ) : (
          <motion.div key={source} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0">
            {source === 'camera' ? (
              <CameraView
                stepIndex={stepIndex}
                firstShot={firstShot}
                onCapture={handleCapture}
                onUnavailable={() => setIsCameraBlocked(true)}
                onSwitchToUpload={() => setPreferredSource('upload')}
              />
            ) : (
              <UploadView
                stepIndex={stepIndex}
                firstShot={firstShot}
                notice={isCameraBlocked && isMobileLayout ? 'No camera access' : null}
                onCapture={handleCapture}
                onSwitchToCamera={canUseCamera ? () => setPreferredSource('camera') : null}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {phase.kind === 'checking' && (
          <motion.div
            key="checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-ground/70 backdrop-blur-sm"
            role="status"
            aria-label="Checking cube"
          >
            <span className="size-5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-ink" />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="flex h-11 items-center rounded-full bg-ground/50 px-3 backdrop-blur-md">
          {phase.kind === 'review' ? <span className="label">Photo</span> : <StepLabel stepIndex={stepIndex} />}
        </span>
        <span className="pointer-events-auto flex items-center gap-2">
          {phase.kind === 'shooting' && <RoundIconButton icon={Paintbrush} label="Paint by hand" onClick={paintByHand} />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            autoFocus
            className="flex size-11 items-center justify-center rounded-full border border-line bg-ground/60 text-ink backdrop-blur-md transition-colors hover:border-line-strong hover:bg-ink/[0.06]"
          >
            <X size={16} strokeWidth={1.7} />
          </button>
        </span>
      </div>
    </>
  )
}

export function CaptureSheet() {
  const isOpen = useCaptureStore((state) => state.isOpen)
  const close = useCaptureStore((state) => state.close)
  const openerRef = useRef<HTMLElement | null>(null)
  const [wasOpen, setWasOpen] = useState(false)

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen && document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement
  }

  useRootInert(isOpen)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

  const restoreFocus = () => {
    if (!useCubeStore.getState().isCustomizeOpen) openerRef.current?.focus()
    openerRef.current = null
  }

  return createPortal(
    <AnimatePresence onExitComplete={restoreFocus}>
      {isOpen && (
        <motion.div
          key="capture-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Photo of your cube"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 overflow-hidden overscroll-contain bg-ground text-ink"
        >
          <CaptureBody onClose={close} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
