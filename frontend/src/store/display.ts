import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DisplayMode = 'tabs' | 'multi'

interface DisplayStore {
  viewMode: DisplayMode
  setViewMode: (mode: DisplayMode) => void
}

export const useDisplayStore = create<DisplayStore>()(
  persist(
    (set) => ({
      viewMode: 'tabs',
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: 'display-store',
      partialize: (state) => ({ viewMode: state.viewMode }),
    }
  )
)
