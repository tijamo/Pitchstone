import { create } from 'zustand'

export type LeftTab = 'files' | 'search' | 'tags'
export type RightTab = 'backlinks' | 'outline' | 'graph'
export type Theme = 'dark' | 'light'

const THEME_KEY = 'pitchstone:theme'
const LEFT_WIDTH_KEY = 'pitchstone:leftWidth'
const RIGHT_WIDTH_KEY = 'pitchstone:rightWidth'

/**
 * Panel widths are the user's to set and are remembered between sessions;
 * these are only the first-run values. The right panel starts wider than the
 * left because the graph lives there and needs the room.
 */
export const DEFAULT_LEFT_WIDTH = 260
export const DEFAULT_RIGHT_WIDTH = 320

/** Narrow enough to be worth keeping, wide enough to still leave an editor. */
export const MIN_PANEL_WIDTH = 180
export const MAX_PANEL_WIDTH = 560

export function clampWidth(width: number): number {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width)))
}

function storedTheme(): Theme | null {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'dark' || value === 'light' ? value : null
}

function storedWidth(key: string, fallback: number): number {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) && value > 0 ? clampWidth(value) : fallback
}

type UiState = {
  leftTab: LeftTab
  rightTab: RightTab
  leftOpen: boolean
  rightOpen: boolean
  leftWidth: number
  rightWidth: number
  /** null means "follow the OS preference". */
  theme: Theme | null
  settingsOpen: boolean
  setLeftTab: (tab: LeftTab) => void
  setRightTab: (tab: RightTab) => void
  toggleLeft: () => void
  toggleRight: () => void
  setLeftWidth: (width: number) => void
  setRightWidth: (width: number) => void
  setTheme: (theme: Theme | null) => void
  setSettingsOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  leftTab: 'files',
  rightTab: 'backlinks',
  leftOpen: true,
  rightOpen: true,
  leftWidth: storedWidth(LEFT_WIDTH_KEY, DEFAULT_LEFT_WIDTH),
  rightWidth: storedWidth(RIGHT_WIDTH_KEY, DEFAULT_RIGHT_WIDTH),
  theme: storedTheme(),
  settingsOpen: false,

  // Selecting a tab also reveals the sidebar if it was collapsed, so the ribbon
  // buttons always do something visible.
  setLeftTab: (leftTab) => set({ leftTab, leftOpen: true }),
  setRightTab: (rightTab) => set({ rightTab, rightOpen: true }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),

  setLeftWidth: (width) => {
    const leftWidth = clampWidth(width)
    localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth))
    set({ leftWidth })
  },

  setRightWidth: (width) => {
    const rightWidth = clampWidth(width)
    localStorage.setItem(RIGHT_WIDTH_KEY, String(rightWidth))
    set({ rightWidth })
  },

  // null is a real choice — "follow the OS" — so it clears the stored value
  // rather than writing one, and App removes the data-theme attribute.
  setTheme: (theme) => {
    if (theme) localStorage.setItem(THEME_KEY, theme)
    else localStorage.removeItem(THEME_KEY)
    set({ theme })
  },

  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}))
