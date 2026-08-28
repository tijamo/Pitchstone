import { create } from 'zustand'
import type { NoteMeta } from '../lib/notes'

export type LeftTab = 'files' | 'search' | 'tags' | 'graph'
export type RightTab = 'backlinks' | 'outline'
export type Theme = 'dark' | 'light'

/**
 * Shown when a clicked [[wikilink]] or graph node names more than one note.
 * Positioned at the click, so it reads as a small menu at that spot rather
 * than a modal taking over the screen for a one-item decision.
 */
export type LinkChoice = { x: number; y: number; target: string; matches: NoteMeta[] }

const THEME_KEY = 'pitchstone:theme'
const GRAPH_LINKS_KEY = 'pitchstone:graphLinks'
const LEFT_WIDTH_KEY = 'pitchstone:leftWidth'
const RIGHT_WIDTH_KEY = 'pitchstone:rightWidth'

/**
 * Panel widths are the user's to set and are remembered between sessions;
 * these are only the first-run values. The left panel starts wider than it
 * used to because the graph lives there now and benefits from the room.
 */
export const DEFAULT_LEFT_WIDTH = 300
export const DEFAULT_RIGHT_WIDTH = 300

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

/** Narrow enough to be worth keeping. */
export const MIN_PANEL_WIDTH = 180
/** The first-run ceiling only — see maxPanelWidth for the real one. */
export const MAX_PANEL_WIDTH = 560

export function clampWidth(width: number, max = MAX_PANEL_WIDTH): number {
  return Math.min(Math.max(max, MIN_PANEL_WIDTH), Math.max(MIN_PANEL_WIDTH, Math.round(width)))
}

const RIBBON_WIDTH = 44

/**
 * How wide a panel may be dragged: everything the window has left after the
 * ribbon and the *other* panel, and no editor held back — a panel can be
 * taken to full width, squeezing the editor away entirely, which is the point
 * of it. The graph is the reason (it reads far better with real room), but
 * the rule is the same for both panels rather than one having a private one.
 *
 * `viewport` is passed in rather than read here so a component can re-derive
 * this as the window resizes — see uiStore's own `viewport`.
 */
export function maxPanelWidth(otherReserved: number, viewport?: number): number {
  const width = viewport ?? (typeof window === 'undefined' ? 0 : window.innerWidth)
  if (!width) return MAX_PANEL_WIDTH
  return Math.max(MIN_PANEL_WIDTH, Math.round(width - RIBBON_WIDTH - otherReserved))
}

/**
 * The width a panel actually renders at: what the user set, held to what the
 * window can currently show. Kept separate from the stored width on purpose —
 * shrinking the window narrows the panel for as long as it stays small, and
 * widening it again gives the panel back the width it was dragged to.
 */
export function fittedWidth(width: number, otherReserved: number, viewport: number): number {
  return Math.min(width, maxPanelWidth(otherReserved, viewport))
}

/**
 * Whether the graph draws [[wikilink]] edges on top of the nesting it always
 * shows. Off by default — the graph's standing job is to show how the vault
 * is *organised*, which is nesting, and links are a second, denser reading of
 * it laid over the top. Remembered between sessions like the panel widths,
 * since it's a way of looking rather than a one-off.
 */
function storedGraphLinks(): boolean {
  return localStorage.getItem(GRAPH_LINKS_KEY) === 'true'
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
  /** The window's own width, watched so a panel dragged wider than a smaller
   * window can show is fitted back into it — see fittedWidth. */
  viewport: number
  leftTab: LeftTab
  rightTab: RightTab
  leftOpen: boolean
  rightOpen: boolean
  leftWidth: number
  rightWidth: number
  /** null means "follow the OS preference". */
  theme: Theme | null
  settingsOpen: boolean
  changelogOpen: boolean
  helpOpen: boolean
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
  /** Graph draws [[wikilink]] edges as well as the nesting it always shows. */
  graphLinks: boolean
  /** The broken-link review, over every note in the vault. */
  linkCheckOpen: boolean
  setLeftTab: (tab: LeftTab) => void
  setRightTab: (tab: RightTab) => void
  toggleLeft: () => void
  toggleRight: () => void
  setLeftWidth: (width: number) => void
  setRightWidth: (width: number) => void
  setTheme: (theme: Theme | null) => void
  setSettingsOpen: (open: boolean) => void
  setChangelogOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  setMobile: (mobile: boolean) => void
  setViewport: (width: number) => void
  closePanels: () => void
  setLinkChoice: (choice: LinkChoice) => void
  clearLinkChoice: () => void
  setGraphFocus: (focus: boolean) => void
  /** Focus the graph on a specific node id and turn focus mode on. */
  focusGraph: (id: string) => void
  setGraphLinks: (show: boolean) => void
  setLinkCheckOpen: (open: boolean) => void
}

// A cold launch opens the left panel either way, on the tab that layout wants
// most: the file tree on a desktop, where it is a column beside the editor,
// and the graph on a phone, where it is a drawer over it and the whole vault
// at a glance beats a list of file names.
const startMobile = isMobileWidth()
const startLeftTab: LeftTab = startMobile ? 'graph' : 'files'
const startLeftWidth = storedWidth(LEFT_WIDTH_KEY, DEFAULT_LEFT_WIDTH)

export const useUiStore = create<UiState>((set, get) => ({
  mobile: startMobile,
  viewport: typeof window === 'undefined' ? 0 : window.innerWidth,
  leftTab: startLeftTab,
  rightTab: 'backlinks',
  // The left drawer opens on a phone too — this is only the module's
  // *initial* value, so it only ever takes effect on an actual fresh load (a
  // real cold launch, or a manual refresh, which a web app cannot tell apart
  // from one). The OS backgrounding and resuming an already-running PWA never
  // re-runs this module, so whatever the drawer was showing then is left
  // alone; setMobile's own resize-driven reset (crossing the breakpoint
  // mid-session) is unaffected too.
  leftOpen: true,
  // On a phone the two panels are drawers over the same screen, so only one
  // of them can start open.
  rightOpen: !startMobile,
  leftWidth: startLeftWidth,
  rightWidth: storedWidth(RIGHT_WIDTH_KEY, DEFAULT_RIGHT_WIDTH),
  theme: storedTheme(),
  settingsOpen: false,
  changelogOpen: false,
  helpOpen: false,
  linkChoice: null,
  graphFocus: false,
  graphFocusId: null,
  graphLinks: storedGraphLinks(),
  linkCheckOpen: false,

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

  setViewport: (viewport) => set((s) => (s.viewport === viewport ? {} : { viewport })),

  closePanels: () => set({ leftOpen: false, rightOpen: false }),

  setLinkChoice: (linkChoice) => set({ linkChoice }),
  clearLinkChoice: () => set({ linkChoice: null }),
  setGraphFocus: (graphFocus) => set({ graphFocus }),
  focusGraph: (id) => set({ graphFocus: true, graphFocusId: id }),
  setGraphLinks: (graphLinks) => {
    localStorage.setItem(GRAPH_LINKS_KEY, String(graphLinks))
    set({ graphLinks })
  },
  setLinkCheckOpen: (linkCheckOpen) => set({ linkCheckOpen }),

  // Both panels are capped by the same rule — everything the window has left
  // after the ribbon and the other panel — so either can be taken to full
  // width. The stored value is what the user dragged to; fittedWidth is what
  // gets rendered if the window is currently too small for it.
  setLeftWidth: (width) => {
    const s = get()
    const leftWidth = clampWidth(width, maxPanelWidth(s.rightOpen ? s.rightWidth : 0, s.viewport))
    localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth))
    set({ leftWidth })
  },

  setRightWidth: (width) => {
    const s = get()
    const rightWidth = clampWidth(width, maxPanelWidth(s.leftOpen ? s.leftWidth : 0, s.viewport))
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
  setChangelogOpen: (changelogOpen) => set({ changelogOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
}))
