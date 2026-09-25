import type { ReactNode } from 'react'
import paintPhoto from '../assets/handbook/paint.webp'
import playbackPhoto from '../assets/handbook/playback.webp'
import shufflePhoto from '../assets/handbook/shuffle.webp'
import solvePhoto from '../assets/handbook/solve.webp'
import turnPhoto from '../assets/handbook/turn.webp'

export interface HandbookPage {
  id: string
  title: string
  caption: string
  touchCaption?: string
  photo?: string
  photoAlt?: string
  visual?: ReactNode
  detail?: ReactNode
}

function KeyCap({ children, isWide = false }: { children: ReactNode; isWide?: boolean }) {
  const isGlyph = typeof children === 'string' && !/^[A-Za-z0-9 ]+$/.test(children)
  return (
    <kbd
      className={`flex h-7 items-center justify-center rounded-md border border-line font-mono text-ink ${isGlyph ? 'text-[14px]' : 'text-[11px] max-sm:text-[12px]'} ${isWide ? 'px-2' : 'w-7'}`}
    >
      {children}
    </kbd>
  )
}

function KeyRow({ keys, trailing }: { keys: string[]; trailing?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1 pointer-coarse:hidden">
      {keys.map((key) => (
        <KeyCap key={key} isWide={key.length > 1}>
          {key}
        </KeyCap>
      ))}
      {trailing}
    </div>
  )
}

const solveMethods = [
  { name: 'Fastest', summary: '~20 moves' },
  { name: 'Beginner', summary: 'layer by layer' },
  { name: 'CFOP', summary: 'cross · F2L · OLL · PLL' },
]

function MethodList() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {solveMethods.map((method) => (
        <div key={method.name} className="contents">
          <dt className="text-[13px] font-medium text-ink">{method.name}</dt>
          <dd className="font-mono text-[11px] max-sm:text-[12px] leading-[19.5px] text-muted">{method.summary}</dd>
        </div>
      ))}
    </dl>
  )
}

const notationTurns = [
  { symbol: 'R', meaning: 'clockwise', sweep: 90, isReversed: false },
  { symbol: 'R′', meaning: 'counter', sweep: 90, isReversed: true },
  { symbol: 'R2', meaning: 'double', sweep: 180, isReversed: false },
]

function arcPath(sweepDegrees: number, isReversed: boolean): { path: string; tip: { x: number; y: number; angle: number } } {
  const center = 32
  const radius = 26
  const startAngle = isReversed ? -45 : -135
  const direction = isReversed ? -1 : 1
  const endAngle = startAngle + direction * sweepDegrees
  const pointAt = (degrees: number) => ({
    x: center + radius * Math.cos((degrees * Math.PI) / 180),
    y: center + radius * Math.sin((degrees * Math.PI) / 180),
  })
  const start = pointAt(startAngle)
  const end = pointAt(endAngle)
  const largeArc = sweepDegrees > 180 ? 1 : 0
  const sweepFlag = isReversed ? 0 : 1
  return {
    path: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${sweepFlag} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    tip: { ...end, angle: endAngle + direction * 90 },
  }
}

function TurnGlyph({ sweep, isReversed }: { sweep: number; isReversed: boolean }) {
  const arc = arcPath(sweep, isReversed)
  return (
    <svg viewBox="0 0 64 64" className="size-full" aria-hidden>
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((column) => (
          <rect
            key={`${row}-${column}`}
            x={17 + column * 10.4}
            y={17 + row * 10.4}
            width={9.2}
            height={9.2}
            rx={1.8}
            className="fill-[#c4202b]"
            opacity={0.92}
          />
        )),
      )}
      <path d={arc.path} fill="none" stroke="var(--color-accent)" strokeWidth={2.2} strokeLinecap="round" />
      <path
        d="M -4 -3.6 L 1.2 0 L -4 3.6"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`translate(${arc.tip.x.toFixed(2)} ${arc.tip.y.toFixed(2)}) rotate(${arc.tip.angle})`}
      />
    </svg>
  )
}

function NotationVisual() {
  return (
    <div className="grid size-full grid-cols-3 items-center gap-2 px-[6%]">
      {notationTurns.map((turn) => (
        <div key={turn.symbol} className="flex flex-col items-center gap-3">
          <div className="aspect-square w-full max-w-[150px]">
            <TurnGlyph sweep={turn.sweep} isReversed={turn.isReversed} />
          </div>
          <span className="font-mono text-[clamp(16px,3.4vw,22px)] text-ink">{turn.symbol}</span>
          <span className="label">{turn.meaning}</span>
        </div>
      ))}
    </div>
  )
}

export const handbookPages: HandbookPage[] = [
  {
    id: 'turn',
    title: 'Turn',
    caption: 'Tap a button, type a face, or drag stickers.',
    touchCaption: 'Tap a button or drag stickers.',
    photo: turnPhoto,
    photoAlt: 'Cube mid-turn on the right face',
    detail: (
      <KeyRow
        keys={['U', 'R', 'F', 'D', 'L', 'B']}
        trailing={
          <span className="ml-3 flex items-center gap-1.5">
            <KeyCap isWide>Shift</KeyCap>
            <span className="label">reverses</span>
          </span>
        }
      />
    ),
  },
  {
    id: 'shuffle',
    title: 'Shuffle',
    caption: 'Twenty-five random turns. Old solutions clear.',
    photo: shufflePhoto,
    photoAlt: 'A shuffled cube',
  },
  {
    id: 'solve',
    title: 'Solve',
    caption: 'Pick a method, then solve.',
    photo: solvePhoto,
    photoAlt: 'Solved cube with its move count',
    detail: <MethodList />,
  },
  {
    id: 'playback',
    title: 'Playback',
    caption: 'Play, step through, or change speed.',
    photo: playbackPhoto,
    photoAlt: 'Cube mid-turn during playback with the current stage',
    detail: <KeyRow keys={['Space', '←', '→']} />,
  },
  {
    id: 'paint',
    title: 'Paint',
    caption: 'Copy your real cube. Impossible stickers get flagged.',
    photo: paintPhoto,
    photoAlt: 'Unfolded cube net',
  },
  {
    id: 'notation',
    title: 'Notation',
    caption: 'Seen from the face itself.',
    visual: <NotationVisual />,
  },
]
