import type { LucideIcon } from 'lucide-react'

interface ToolButtonProps {
  icon: LucideIcon
  label: string
  tip: string
  onClick: () => void
  isDisabled?: boolean
  isBusy?: boolean
  isPressed?: boolean
  tipAlign?: 'end'
}

export function ToolButton({ icon: Icon, label, tip, onClick, isDisabled = false, isBusy = false, isPressed, tipAlign }: ToolButtonProps) {
  return (
    <button
      type="button"
      data-tip={tip}
      data-tip-side="bottom"
      data-tip-align={tipAlign}
      disabled={isDisabled}
      aria-pressed={isPressed}
      onClick={onClick}
      className={`group flex flex-1 flex-col items-center gap-1.5 rounded-xl border py-2.5 text-ink transition-[background-color,border-color,transform] duration-150 hover:border-line-strong hover:bg-ink/[0.035] active:scale-[0.97] disabled:opacity-35 disabled:hover:bg-transparent ${
        isPressed ? 'border-line-strong bg-ink/[0.05]' : 'border-line'
      }`}
    >
      <Icon size={16} strokeWidth={1.6} aria-hidden className={isBusy ? 'animate-spin' : 'transition-transform duration-300 group-hover:-rotate-6'} />
      <span className="label">{label}</span>
    </button>
  )
}
