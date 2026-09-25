import { faceColorNames, faceColors, faceOrder } from '../cube/facelets'
import { moveSuffixes, type Move } from '../cube/moves'
import { useCubeStore } from '../state/useCubeStore'

const suffixDescriptions = { '': 'clockwise', "'": 'counter-clockwise', '2': 'half turn' } as const

export function MovePad() {
  const userMove = useCubeStore((state) => state.userMove)
  return (
    <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Face turns">
      {moveSuffixes.map((suffix) =>
        faceOrder.map((face) => {
          const move = `${face}${suffix}` as Move
          return (
            <button
              key={move}
              type="button"
              aria-label={`${faceColorNames[face]} face ${suffixDescriptions[suffix]}`}
              onClick={() => userMove(move)}
              className="relative flex h-10 items-center pointer-coarse:h-11 justify-center gap-1.5 rounded-lg border border-line font-mono text-[13px] text-ink transition-[background-color,border-color,transform] duration-100 hover:border-line-strong hover:bg-ink/[0.04] active:scale-[0.94] active:bg-ink/[0.08]"
            >
              {suffix === '' && <span className="size-1.5 rounded-full" style={{ backgroundColor: faceColors[face] }} aria-hidden />}
              {move}
            </button>
          )
        }),
      )}
    </div>
  )
}
