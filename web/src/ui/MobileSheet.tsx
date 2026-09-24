import { motion } from 'framer-motion'
import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react'

const handleHeight = 24
const maxExpandedHeight = 520
const maxExpandedViewportShare = 0.56

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

export function MobileSheet({ children, compactBar }: MobileSheetProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null)
  const contentHeight = useElementHeight(contentElement)
  const viewportHeight = useViewportHeight()
  const maxHeight = Math.min(maxExpandedHeight, viewportHeight * maxExpandedViewportShare)
  const sheetHeight = Math.min(contentHeight + handleHeight, maxHeight)

  return (
    <motion.section
      aria-label="Controls"
      initial={false}
      animate={{ height: sheetHeight }}
      transition={{ type: 'spring', stiffness: 380, damping: 40 }}
      className="relative flex shrink-0 flex-col overflow-hidden rounded-t-[22px] border-t border-line bg-raised"
    >
      <button
        type="button"
        aria-label={isExpanded ? 'Collapse controls' : 'Expand controls'}
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
        className="flex shrink-0 items-center justify-center"
        style={{ height: handleHeight }}
      >
        <span className="h-1 w-9 rounded-full bg-line-strong" />
      </button>
      <div className="hairline-scroll min-h-0 flex-1 overflow-y-auto">
        <motion.div
          key={isExpanded ? 'expanded' : 'compact'}
          ref={setContentElement}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {isExpanded ? children : compactBar}
        </motion.div>
      </div>
    </motion.section>
  )
}
