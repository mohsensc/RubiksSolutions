import { CircleHelp } from 'lucide-react'

export function HelpButton({ onClick, isExpanded }: { onClick: () => void; isExpanded: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Handbook"
      aria-haspopup="dialog"
      aria-expanded={isExpanded}
      aria-keyshortcuts="?"
      data-tip="Handbook · ?"
      data-tip-side="bottom"
      data-tip-align="end"
      className="group -mr-2.5 flex size-11 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:text-ink"
    >
      <span className="flex size-8 items-center justify-center rounded-full border border-transparent transition-[border-color,background-color] duration-150 group-hover:border-line group-hover:bg-ink/[0.03]">
        <CircleHelp size={17} strokeWidth={1.6} aria-hidden />
      </span>
    </button>
  )
}
