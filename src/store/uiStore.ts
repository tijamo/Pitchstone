import { create } from 'zustand'
import type { NoteMeta } from '../lib/notes'

export type LeftTab = 'files' | 'search' | 'tags'
export type RightTab = 'backlinks' | 'outline' | 'graph'
export type Theme = 'dark' | 'light'

/**
 * Shown when a clicked [[wikilink]] or graph node names more than one note.
 * Positioned at the click, so it reads as a small menu at that spot rather
 * than a modal taking over the screen for a one-item decision.
 */
export type LinkChoice = { x: number; y: number; target: string; matches: NoteMeta[] }

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

/**
 * Below this width the shell folds to a single pane: the sidebars become
 * drawers over the editor and the ribbon becomes a bottom bar. It is a token
 * in two places — here and the `@media` block in app.css — because layout is
 * CSS's job and behaviour is the store's, and the two have to agree.
 */
export const MOBILE_BREAKPOINT = 700

export function isMobileWidth(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
}

/** Narrow enough to be worth keeping, wide enough to still leave an editor. */
export const MIN_PANEL_WIDTH = 180
export const MAX_PANEL_WIDTH = 560

export function clampWidth(width: number, max = MAX_PANEL_WIDTH): number {
  return Math.min(max, Math.max(MIN_PANEL_WIDTH, Math.round(width)))
}

const RIBBON_WIDTH = 44
/** However narrow the editor is allowed to get before it stops giving up room. */
const MIN_EDITOR_WIDTH = 360

/**
 * The right panel's own cap — much larger than the left's, because the graph
 * that lives there benefits from real width the way a file list or backlinks
 * panel never would. It floats with the window rather than a fixed number:
 * whatever's left after the ribbon, the left sidebar (if open), and enough
 * room that the editor is never squeezed away entirely. Never smaller than
 * the ordinary max, so a narrow window behaves exactly as it did before.
 */
export function maxRightWidth(leftReserved: number): number {
  if (typeof window === 'undefined') return MAX_PANEL_WIDTH
  const available = window.innerWidth - RIBBON_WIDTH - leftReserved - MIN_EDITOR_WIDTH
  return Math.max(MAX_PANEL_WIDTH, Math.round(available))
}

function storedTheme(): Theme | null {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'dark' || value === 'light' ? value : null
}

function storedWidth(key: string, fallback: number, max = MAX_PANEL_WIDTH): number {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) && value > 0 ? clampWidth(value, max) : fallback
}

type UiState = {
  /** True while the viewport is phone-sized; see MOBILE_BREAKPOINT. */
  mobile: boolean
  leftTab: LeftTab
  rightTab: RightTab
  leftOpen: boolean
  rightOpen: boolean
  leftWidth: number
  rightWidth: number
  /** null means "follow the OS preference". */
  theme: Theme | null
  settingsOpen: boolean
  linkChoice: LinkChoice | null
  /** Graph shows a branching tree rooted at graphFocusId, not the whole vault. */
  graphFocus: boolean
  /**
   * What that tree is rooted at — a note id, a folder's `folder:<path>` id, or
   * an unresolved/ambiguous link's `unresolved:<title>` id (see GraphView).
   * null defers to whichever note is open. Kept separate from vaultStore's
   * activeId because a folder or a not-yet-written link has no note to be
   * "active" — this is the only way to point the graph at one of those.
   */
  graphFocusId: string | null
  setLeftTab: (tab: LeftTab) => void
  setRightTab: (tab: RightTab) => void
  toggleLeft: () => void
  toggleRight: () => void
  setLeftWidth: (width: number) => void
  setRightWidth: (width: number) => void
  setTheme: (theme: Theme | null) => void
  setSettingsOpen: (open: boolean) => void
  setMobile: (mobile: boolean) => void
  closePanels: () => void
  setLinkChoice: (choice: LinkChoice) => void
  clearLinkChoice: () => void
  setGraphFocus: (focus: boolean) => void
  /** Focus the graph on a specific node id and turn focus mode on. */
  focusGraph: (id: string) => void
}

// Both sidebars start open on a desktop and closed on a phone, where they are
// drawers over the editor rather than columns beside it.
const startMobile = isMobileWidth()
const startLeftOpen = !startMobile
const startLeftWidth = storedWidth(LEFT_WIDTH_KEY, DEFAULT_LEFT_WIDTH)

export const useUiStore = create<UiState>((set, get) => ({
  mobile: startMobile,
  leftTab: 'files',
  // The graph is the most useful thing to land on: it shows the whole vault
  // rather than one note's neighbours, and backlinks are one click away.
  rightTab: 'graph',
  leftOpen: startLeftOpen,
  rightOpen: !startMobile,
  leftWidth: startLeftWidth,
  rightWidth: storedWidth(
    RIGHT_WIDTH_KEY,
    DEFAULT_RIGHT_WIDTH,
    maxRightWidth(startLeftOpen ? startLeftWidth : 0),
  ),
  theme: storedTheme(),
  settingsOpen: false,
  linkChoice: null,
  graphFocus: false,
  graphFocusId: null,

  // Selecting a tab also reveals the sidebar if it was collapsed, so the ribbon
  // buttons always do something visible. On a phone the two panels are drawers
  // over the same screen, so opening one closes the other rather than stacking.
  setLeftTab: (leftTab) =>
    set((s) => ({ leftTab, leftOpen: true, rightOpen: s.mobile ? false : s.rightOpen })),
  setRightTab: (rightTab) =>
    set((s) => ({ rightTab, rightOpen: true, leftOpen: s.mobile ? false : s.leftOpen })),
  toggleLeft: () =>
    set((s) => ({
      leftOpen: !s.leftOpen,
      rightOpen: s.mobile && !s.leftOpen ? false : s.rightOpen,
    })),
  toggleRight: () =>
    set((s) => ({
      rightOpen: !s.rightOpen,
      leftOpen: s.mobile && !s.rightOpen ? false : s.leftOpen,
    })),

  // Crossing the breakpoint resets both panels to what that layout expects:
  // open beside the editor on a desktop, out of the way on a phone.
  setMobile: (mobile) =>
    set((s) => (s.mobile === mobile ? {} : { mobile, leftOpen: !mobile, rightOpen: !mobile })),

  closePanels: () => set({ leftOpen: false, rightOpen: false }),

  setLinkChoice: (linkChoice) => set({ linkChoice }),
  clearLinkChoice: () => set({ linkChoice: null }),
  setGraphFocus: (graphFocus) => set({ graphFocus }),
  focusGraph: (id) => set({ graphFocus: true, graphFocusId: id }),

  setLeftWidth: (width) => {
    const leftWidth = clampWidth(width)
    localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth))
    set({ leftWidth })
  },

  setRightWidth: (width) => {
    const s = get()
    const max = s.mobile ? MAX_PANEL_WIDTH : maxRightWidth(s.leftOpen ? s.leftWidth : 0)
    const rightWidth = clampWidth(width, max)
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
