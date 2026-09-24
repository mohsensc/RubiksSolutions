import { MotionConfig } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { engine } from './engine/engineClient'
import { useCubeStore } from './state/useCubeStore'
import { CompactBar } from './ui/CompactBar'
import { ControlPanel } from './ui/ControlPanel'
import { EnginePill } from './ui/EnginePill'
import { MobileSheet } from './ui/MobileSheet'
import { StageBanner } from './ui/StageBanner'
import { useKeyboardControls } from './ui/useKeyboardControls'
import { useMediaQuery } from './ui/useMediaQuery'

const CubeStage = lazy(() => import('./scene/CubeStage').then((module) => ({ default: module.CubeStage })))
const CustomizeSheet = lazy(() => import('./ui/CustomizeSheet').then((module) => ({ default: module.CustomizeSheet })))

function Wordmark() {
  return (
    <h1 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em]">
      <span className="grid size-3.5 grid-cols-2 gap-px" aria-hidden>
        <span className="rounded-[1.5px] bg-accent" />
        <span className="rounded-[1.5px] bg-ink" />
        <span className="rounded-[1.5px] bg-ink" />
        <span className="rounded-[1.5px] bg-ink" />
      </span>
      QuickCube
    </h1>
  )
}

export default function App() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const setEngineStatus = useCubeStore((state) => state.setEngineStatus)
  const isCustomizeOpen = useCubeStore((state) => state.isCustomizeOpen)
  const appShellRef = useRef<HTMLDivElement>(null)

  useKeyboardControls()

  useEffect(() => {
    engine.start()
    return engine.onStatus((status) => setEngineStatus(status))
  }, [setEngineStatus])

  useEffect(() => {
    appShellRef.current?.toggleAttribute('inert', isCustomizeOpen)
  }, [isCustomizeOpen])

  return (
    <MotionConfig reducedMotion="user">
      <div ref={appShellRef} className="flex h-dvh flex-col lg:flex-row">
        <main className="relative min-h-0 flex-1">
          <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] lg:px-7 lg:pt-6">
            <Wordmark />
            <div className="pointer-events-auto">
              <EnginePill />
            </div>
          </header>
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <CubeStage />
            </Suspense>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center lg:bottom-10">
            <StageBanner />
          </div>
        </main>
        {isDesktop ? (
          <aside aria-label="Controls" className="flex w-[380px] shrink-0 flex-col border-l border-line px-6 pt-7 pb-6">
            <ControlPanel />
          </aside>
        ) : (
          <MobileSheet compactBar={<CompactBar />}>
            <ControlPanel />
          </MobileSheet>
        )}
      </div>
      <Suspense fallback={null}>
        <CustomizeSheet />
      </Suspense>
    </MotionConfig>
  )
}
