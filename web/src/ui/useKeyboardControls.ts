import { useEffect } from 'react'
import { isFace } from '../cube/facelets'
import type { Move } from '../cube/moves'
import { useCubeStore } from '../state/useCubeStore'

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function useKeyboardControls() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      const store = useCubeStore.getState()
      if (store.isCustomizeOpen) return
      const face = event.key.toUpperCase()
      if (isFace(face)) {
        event.preventDefault()
        store.userMove((event.shiftKey ? `${face}'` : face) as Move)
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        store.undo()
        return
      }
      if (!store.solution) return
      if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        store.togglePlay()
      } else if (event.key === 'ArrowRight') {
        store.stepForward()
      } else if (event.key === 'ArrowLeft') {
        store.stepBack()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
