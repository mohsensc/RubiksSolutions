import { animate, motion, useMotionValue } from 'framer-motion'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useMediaQuery } from './useMediaQuery'

const handleHeight = 26
const compactHeightEstimate = handleHeight + 64
const expandedViewportShare = 0.56
const maxExpandedHeight = 540
const fullViewportShare = 0.84
const minimumStageHeight = 220
const tapSlopPixels = 6
const flickVelocity = 0.45
const sheetSpring = { type: 'spring', stiffness: 380, damping: 40 } as const
const contentFollowStep = 40

type SheetSnap = 'compact' | 'expanded' | 'full'

function subscribeToResize(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

function useViewportHeight(): number {
  return useSyncExternalStore(subscribeToResize, () => window.innerHeight)
}

function useElementHeight(element: HTMLElement | null): number {
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    if (!element) return
    setHeight(element.getBoundingClientRect().height)
    const observer = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height))
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return height
}

interface MobileSheetProps {
  children: ReactNode
  compactBar: ReactNode
}

interface SheetDrag {
  pointerId: number
  startY: number
  startHeight: number
  lastY: number
  lastTime: number
  velocity: number
  hasMoved: boolean
}

function SidePanel({ children }: { children: ReactNode }) {
  return (
    <aside
      aria-label="Controls"
      className="hairline-scroll flex w-[min(21rem,44vw)] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-line bg-raised pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-4"
    >
      {children}
    </aside>
  )
}

function BottomSheet({ children, compactBar }: MobileSheetProps) {
  const [snap, setSnap] = useState<SheetSnap>('expanded')
  const [isDragging, setIsDragging] = useState(false)
  const [isPreviewingExpanded, setIsPreviewingExpanded] = useState(false)
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null)
  const contentHeight = useElementHeight(contentElement)
  const viewportHeight = useViewportHeight()
  const dragRef = useRef<SheetDrag | null>(null)
  const wasDraggedRef = useRef(false)

  const naturalHeight = contentHeight + handleHeight
  const expandedLimit = Math.min(maxExpandedHeight, viewportHeight * expandedViewportShare)
  const fullLimit = Math.max(expandedLimit, Math.min(viewportHeight * fullViewportShare, viewportHeight - minimumStageHeight))
  const expandedHeight = Math.min(naturalHeight, expandedLimit)
  const canGoFull = naturalHeight > expandedLimit + 24
  const isShowingExpanded = snap !== 'compact' || isPreviewingExpanded
  const targetHeight = snap === 'full' ? Math.min(naturalHeight, fullLimit) : snap === 'expanded' ? expandedHeight : naturalHeight

  const sheetHeight = useMotionValue(targetHeight)
  const settledLayoutRef = useRef('')
  const isSpringSettledRef = useRef(true)

  useEffect(() => {
    if (isDragging || contentHeight === 0) {
      settledLayoutRef.current = ''
      return
    }
    const layoutKey = `${snap}:${viewportHeight}`
    const isContentOnlyChange = settledLayoutRef.current === layoutKey
    settledLayoutRef.current = layoutKey
    const isGentleShrink = targetHeight <= sheetHeight.get() && sheetHeight.get() - targetHeight <= contentFollowStep
    if (isContentOnlyChange && isSpringSettledRef.current && isGentleShrink) {
      sheetHeight.set(targetHeight)
      return
    }
    isSpringSettledRef.current = false
    const controls = animate(sheetHeight, targetHeight, {
      ...sheetSpring,
      onComplete: () => {
        isSpringSettledRef.current = true
      },
    })
    return () => controls.stop()
  }, [isDragging, targetHeight, contentHeight, sheetHeight, snap, viewportHeight])

  const snapHeights: Array<[SheetSnap, number]> = [
    ['compact', compactHeightEstimate],
    ['expanded', snap === 'compact' ? Math.min(expandedLimit, Math.max(compactHeightEstimate + 120, expandedHeight)) : expandedHeight],
    ...(canGoFull ? [['full', fullLimit] as [SheetSnap, number]] : []),
  ]

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const now = performance.now()
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: sheetHeight.get(),
      lastY: event.clientY,
      lastTime: now,
      velocity: 0,
      hasMoved: false,
    }
    wasDraggedRef.current = false
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const offset = event.clientY - drag.startY
    if (!drag.hasMoved && Math.abs(offset) < tapSlopPixels) return
    if (!drag.hasMoved) {
      drag.hasMoved = true
      setIsDragging(true)
    }
    const now = performance.now()
    const elapsed = Math.max(1, now - drag.lastTime)
    drag.velocity = (event.clientY - drag.lastY) / elapsed
    drag.lastY = event.clientY
    drag.lastTime = now
    const upperBound = canGoFull ? fullLimit : Math.max(expandedHeight, compactHeightEstimate + 120)
    const rawHeight = drag.startHeight - offset
    const overshoot =
      rawHeight > upperBound
        ? (rawHeight - upperBound) * 0.2
        : rawHeight < compactHeightEstimate
          ? (rawHeight - compactHeightEstimate) * 0.2
          : 0
    const nextHeight = Math.min(Math.max(rawHeight, compactHeightEstimate), upperBound) + overshoot
    sheetHeight.set(nextHeight)
    setIsPreviewingExpanded(snap === 'compact' && nextHeight > compactHeightEstimate + 36)
  }

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (!drag.hasMoved) return
    wasDraggedRef.current = true
    const projectedHeight = sheetHeight.get() - drag.velocity * 180
    const orderedSnaps = snapHeights.map(([snapName]) => snapName)
    const currentIndex = orderedSnaps.indexOf(snap)
    let nextSnap = snapHeights.reduce((best, candidate) =>
      Math.abs(candidate[1] - projectedHeight) < Math.abs(best[1] - projectedHeight) ? candidate : best,
    )[0]
    if (nextSnap === snap && Math.abs(drag.velocity) > flickVelocity) {
      const flickIndex = currentIndex + (drag.velocity < 0 ? 1 : -1)
      nextSnap = orderedSnaps[Math.min(Math.max(flickIndex, 0), orderedSnaps.length - 1)]
    }
    setSnap(nextSnap)
    setIsPreviewingExpanded(false)
    setIsDragging(false)
  }

  const handleClick = () => {
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false
      return
    }
    setSnap((current) => (current === 'compact' ? 'expanded' : 'compact'))
  }

  return (
    <motion.section
      aria-label="Controls"
      style={{ height: sheetHeight }}
      className="relative flex shrink-0 flex-col overflow-hidden rounded-t-[22px] border-t border-line bg-raised md:mx-auto md:w-[min(100%,36rem)] md:border-x"
    >
      <button
        type="button"
        aria-label={snap === 'compact' ? 'Expand controls' : 'Collapse controls'}
        aria-expanded={snap !== 'compact'}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        className="group flex shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
        style={{ height: handleHeight }}
      >
        <span
          className={`h-1 rounded-full transition-[width,background-color] duration-200 ${
            isDragging ? 'w-12 bg-ink/40' : 'w-9 bg-line-strong group-hover:bg-ink/30'
          }`}
        />
      </button>
      <div className="hairline-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <motion.div
          key={isShowingExpanded ? 'expanded' : 'compact'}
          ref={setContentElement}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col px-4 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {isShowingExpanded ? children : compactBar}
        </motion.div>
      </div>
    </motion.section>
  )
}

export function MobileSheet({ children, compactBar }: MobileSheetProps) {
  const isLandscapePhone = useMediaQuery('(orientation: landscape) and (max-height: 540px)')
  if (isLandscapePhone) return <SidePanel>{children}</SidePanel>
  return <BottomSheet compactBar={compactBar}>{children}</BottomSheet>
}
