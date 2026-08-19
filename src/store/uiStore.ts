import { create } from 'zustand'

export type LeftTab = 'files' | 'search' | 'tags' | 'graph'
export type RightTab = 'backlinks' | 'outline'
export type Theme = 'dark' | 'light'

const THEME_KEY = 'pitchstone:theme'

function storedTheme(): Theme | null {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'dark' || value === 'light' ? value : null
}

type UiState = {
  leftTab: LeftTab
  rightTab: RightTab
  leftOpen: boolean
  rightOpen: boolean
  /** null means "follow the OS preference". */
  theme: Theme | null
  setLeftTab: (tab: LeftTab) => void
  setRightTab: (tab: RightTab) => void
  toggleLeft: () => void
  toggleRight: () => void
  toggleTheme: () => void
}

export const useUiStore = create<UiState>((set) => ({
  leftTab: 'files',
  rightTab: 'backlinks',
  leftOpen: true,
  rightOpen: true,
  theme: storedTheme(),

  // Selecting a tab also reveals the sidebar if it was collapsed, so the ribbon
  // buttons always do something visible.
  setLeftTab: (leftTab) => set({ leftTab, leftOpen: true }),
  setRightTab: (rightTab) => set({ rightTab, rightOpen: true }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),

  toggleTheme: () =>
    set((s) => {
      const resolved =
        s.theme ??
        (window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark')
      const theme: Theme = resolved === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, theme)
      return { theme }
    }),
}))
