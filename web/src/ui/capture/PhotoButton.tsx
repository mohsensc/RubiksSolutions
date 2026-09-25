import { Camera } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { ToolButton } from '../ToolButton'
import { useCaptureStore } from './useCaptureStore'

const CaptureSheet = lazy(() => import('./CaptureSheet').then((module) => ({ default: module.CaptureSheet })))

export function PhotoButton() {
  const isOpen = useCaptureStore((state) => state.isOpen)
  const open = useCaptureStore((state) => state.open)
  const [hasOpened, setHasOpened] = useState(isOpen)
  if (isOpen && !hasOpened) setHasOpened(true)
  return (
    <>
      <ToolButton icon={Camera} label="Photo" tip="Load your cube from photos" onClick={open} />
      <Suspense fallback={null}>{hasOpened && <CaptureSheet />}</Suspense>
    </>
  )
}
