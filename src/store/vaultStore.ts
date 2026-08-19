import { create } from 'zustand'
import {
  createNote,
  deleteNote,
  describeError,
  fetchNote,
  listNotes,
  renameNote,
  saveContent,
  type NoteMeta,
} from '../lib/notes'
import { dirname, joinPath, sanitizeSegment, toPath, uniquePath } from '../lib/paths'

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

/** How long to wait after the last keystroke before writing to Supabase. */
const SAVE_DELAY_MS = 700

// Held outside the store: a pending write is scheduling state, not something
// the UI renders, and it must survive re-renders untouched.
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingWrite: { id: string; content: string } | null = null

type VaultState = {
  notes: NoteMeta[]
  activeId: string | null
  content: string
  loading: boolean
  saveStatus: SaveStatus
  error: string | null
  /** The note whose name is currently being edited in the explorer, if any. */
  renamingId: string | null

  load: () => Promise<void>
  open: (id: string) => Promise<void>
  edit: (content: string) => void
  flush: () => Promise<void>
  create: (dir?: string, name?: string) => Promise<string | null>
  openOrCreate: (title: string) => Promise<void>
  rename: (id: string, input: string) => Promise<void>
  remove: (id: string) => Promise<void>
  setRenaming: (id: string | null) => void
  dismissError: () => void
  reset: () => void
}

export const useVaultStore = create<VaultState>((set, get) => ({
  notes: [],
  activeId: null,
  content: '',
  loading: false,
  saveStatus: 'idle',
  error: null,
  renamingId: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      set({ notes: await listNotes(), loading: false })
    } catch (error) {
      set({ loading: false, error: describeError(error) })
    }
  },

  open: async (id) => {
    if (get().activeId === id) return
    // Never let a queued write land after we have moved on to another note.
    await get().flush()
    try {
      const note = await fetchNote(id)
      set({ activeId: note.id, content: note.content, saveStatus: 'idle' })
    } catch (error) {
      set({ error: describeError(error) })
    }
  },

  edit: (content) => {
    const id = get().activeId
    if (!id) return

    set({ content, saveStatus: 'unsaved' })
    pendingWrite = { id, content }
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void get().flush(), SAVE_DELAY_MS)
  },

  flush: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const write = pendingWrite
    if (!write) return
    pendingWrite = null

    set({ saveStatus: 'saving' })
    try {
      const saved = await saveContent(write.id, write.content)
      set((state) => ({
        saveStatus: pendingWrite ? state.saveStatus : 'saved',
        notes: state.notes.map((n) => (n.id === saved.id ? { ...n, ...saved } : n)),
      }))
    } catch (error) {
      set({ saveStatus: 'error', error: describeError(error) })
    }
  },

  create: async (dir = '', name) => {
    // A queued write belongs to the note being left behind, not the new one.
    await get().flush()
    try {
      const taken = new Set(get().notes.map((n) => n.path))
      const base = sanitizeSegment(name ?? 'Untitled') || 'Untitled'
      const path = uniquePath(taken, `${joinPath(dir, base)}.md`)
      const note = await createNote(path)
      set((state) => ({
        notes: [...state.notes, note],
        activeId: note.id,
        content: note.content,
        saveStatus: 'idle',
        // An unnamed note drops straight into renaming, the way Obsidian does.
        // One created from a wikilink already has the name the link gave it.
        renamingId: name ? null : note.id,
      }))
      return note.id
    } catch (error) {
      set({ error: describeError(error) })
      return null
    }
  },

  // Following a wikilink: open the note it names, or create it alongside the
  // current one if it does not exist yet.
  openOrCreate: async (title) => {
    const state = get()
    const wanted = title.trim().toLowerCase()
    const existing = state.notes.find((n) => n.title.toLowerCase() === wanted)
    if (existing) {
      await state.open(existing.id)
      return
    }
    const active = state.notes.find((n) => n.id === state.activeId)
    await state.create(active ? dirname(active.path) : '', title.trim())
  },

  rename: async (id, input) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return

    const path = toPath(input, dirname(note.path))
    set({ renamingId: null })
    if (!path || path === note.path) return

    try {
      const saved = await renameNote(id, path)
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, ...saved } : n)),
      }))
    } catch (error) {
      set({ error: describeError(error) })
    }
  },

  remove: async (id) => {
    try {
      if (get().activeId === id) {
        // Drop any queued write for a note that is about to stop existing.
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = null
        pendingWrite = null
      }
      await deleteNote(id)
      set((state) => ({
        notes: state.notes.filter((n) => n.id !== id),
        ...(state.activeId === id
          ? { activeId: null, content: '', saveStatus: 'idle' as SaveStatus }
          : {}),
      }))
    } catch (error) {
      set({ error: describeError(error) })
    }
  },

  setRenaming: (renamingId) => set({ renamingId }),
  dismissError: () => set({ error: null }),

  reset: () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    pendingWrite = null
    set({
      notes: [],
      activeId: null,
      content: '',
      saveStatus: 'idle',
      error: null,
      renamingId: null,
    })
  },
}))
