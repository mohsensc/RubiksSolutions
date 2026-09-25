import { create } from 'zustand'

interface CaptureState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useCaptureStore = create<CaptureState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
