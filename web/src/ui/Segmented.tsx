import { motion } from 'framer-motion'
import { useRef, type KeyboardEvent } from 'react'

export interface SegmentedOption<Value extends string | number> {
  value: Value
  label: string
  tip?: string
  tipAlign?: 'end'
}

interface SegmentedProps<Value extends string | number> {
  options: ReadonlyArray<SegmentedOption<Value>>
  value: Value
  onChange: (value: Value) => void
  indicatorId: string
  ariaLabel: string
  isCompact?: boolean
}

const stepByKey: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

export function Segmented<Value extends string | number>({
  options,
  value,
  onChange,
  indicatorId,
  ariaLabel,
  isCompact = false,
}: SegmentedProps<Value>) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = stepByKey[event.key]
    const targetIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : step
            ? (selectedIndex + step + options.length) % options.length
            : -1
    if (targetIndex < 0) return
    event.preventDefault()
    event.stopPropagation()
    onChange(options[targetIndex].value)
    optionRefs.current[targetIndex]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={handleKeyDown} className="flex rounded-full border border-line p-0.5">
      {options.map((option, optionIndex) => {
        const isActive = optionIndex === selectedIndex
        return (
          <button
            key={option.value}
            ref={(element) => {
              optionRefs.current[optionIndex] = element
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            data-tip={option.tip}
            data-tip-side="bottom"
            data-tip-align={option.tipAlign}
            onClick={() => onChange(option.value)}
            className={`relative flex-1 rounded-full font-mono uppercase tracking-[0.08em] transition-colors duration-200 ${
              isCompact
                ? 'px-2 py-1.5 text-[11px] max-sm:text-[12px] pointer-coarse:min-h-10 pointer-coarse:min-w-10'
                : 'px-3 py-2 text-[12px] pointer-coarse:min-h-11'
            } ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {isActive && (
              <motion.span
                layoutId={indicatorId}
                className="absolute inset-0 rounded-full border border-line-strong bg-ink/[0.06]"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
