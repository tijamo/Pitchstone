import { create } from 'zustand'
import {
  backfillIndex,
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

/**
 * The `updated_at` of the text currently in the editor. It is what tells a
 * refresh whether the open note moved underneath us: our own saves advance it,
 * so only somebody else's write leaves it behind. Held out here with the save
 * state for the same reason — it is bookkeeping, not something the UI renders.
 */
let openedAt: string | null = null

/**
 * Stop and ask. The queued write is kept, not cancelled — `keepLocalEdits`
 * sends it and `reloadOpenNote` drops it — but its timer is, so nothing lands
 * on the server while the question is on screen.
 */
function hold(
  set: (partial: Partial<VaultState>) => void,
  reason: 'changed' | 'deleted',
): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  set({ openNoteStale: reason })
}

/** A note list is unchanged if every note is where it was, at the same age. */
function fingerprint(notes: NoteMeta[]): string {
  return notes
    .map((n) => `${n.id}:${n.path}:${n.updated_at}`)
    .sort()
    .join('|')
}

type VaultState = {
  notes: NoteMeta[]
  activeId: string | null
  content: string
  loading: boolean
  saveStatus: SaveStatus
  error: string | null
  /** The note whose name is currently being edited in the explorer, if any. */
  renamingId: string | null
  /**
   * Bumped whenever a note's links may have changed. The graph watches this:
   * its own data is the link table, which the note list alone cannot reveal
   * has moved — adding a [[link]] to an existing note changes no note ids.
   */
  linksVersion: number
  /**
   * Bumped when the open note's text is replaced from outside the editor —
   * by a refresh, not by typing. CodeMirror otherwise only reloads its
   * document when a *different* note is opened.
   */
  contentVersion: number
  /**
   * Set when the open note moved underneath unsaved local edits. Saving is
   * last-write-wins on the whole document, so the choice belongs to whoever
   * is typing rather than to whichever write lands second.
   */
  openNoteStale: 'changed' | 'deleted' | null

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
  refresh: () => Promise<void>
  reloadOpenNote: () => Promise<void>
  keepLocalEdits: () => void
  closeOpenNote: () => void
}

export const useVaultStore = create<VaultState>((set, get) => ({
  notes: [],
  activeId: null,
  content: '',
  loading: false,
  saveStatus: 'idle',
  error: null,
  renamingId: null,
  linksVersion: 0,
  contentVersion: 0,
  openNoteStale: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      set({ notes: await listNotes(), loading: false })
    } catch (error) {
      set({ loading: false, error: describeError(error) })
      return
    }

    // Catch up any note whose tags and links were never extracted — notes
    // that predate the save path that writes them. Deliberately after the
    // first render: the vault is usable while this runs, and a vault with
    // nothing to do pays one cheap indexed query for the privilege.
    try {
      if ((await backfillIndex()) > 0) {
        // Tags are note metadata, so the list just rendered is now out of
        // date; links are the graph's own data, hence the separate bump.
        const notes = await listNotes()
        set((state) => ({ notes, linksVersion: state.linksVersion + 1 }))
      }
    } catch {
      // A vault that cannot catch up still opens; the next load tries again.
    }
  },

  open: async (id) => {
    if (get().activeId === id) return
    // Never let a queued write land after we have moved on to another note.
    await get().flush()
    try {
      const note = await fetchNote(id)
      openedAt = note.updated_at
      set((state) => ({
        activeId: note.id,
        content: note.content,
        saveStatus: 'idle',
        openNoteStale: null,
        contentVersion: state.contentVersion + 1,
      }))
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
    saveTimer = null
    // While the writer is being asked which version wins, the autosave waits
    // for their answer. Letting it run would overwrite the very change they
    // are being asked about, which would make the question theatre.
    if (get().openNoteStale) return
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

    // An unanswered conflict means these edits were never accepted for
    // saving. Leaving the note, closing the tab, or a queued write coming due
    // all take the server's copy — which is what the notice says will happen.
    if (get().openNoteStale) return

    set({ saveStatus: 'saving' })
    try {
      const saved = await saveContent(write.id, write.content)
      // Our own write is the newest one; anything a refresh flagged as having
      // changed under us has just been answered by overwriting it on purpose.
      if (saved.id === get().activeId) openedAt = saved.updated_at
      set((state) => ({
        saveStatus: pendingWrite ? state.saveStatus : 'saved',
        openNoteStale: saved.id === state.activeId ? null : state.openNoteStale,
        notes: state.notes.map((n) => (n.id === saved.id ? { ...n, ...saved } : n)),
        // The save rewrote this note's links, which no note id reflects.
        linksVersion: state.linksVersion + 1,
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
      openedAt = note.updated_at
      set((state) => ({
        notes: [...state.notes, note],
        activeId: note.id,
        content: note.content,
        saveStatus: 'idle',
        openNoteStale: null,
        contentVersion: state.contentVersion + 1,
        // An unnamed note drops straight into renaming, the way Obsidian does.
        // One created from a wikilink already has the name the link gave it.
        renamingId: name ? null : note.id,
        // Creating a note can resolve links that were dangling until now.
        linksVersion: state.linksVersion + 1,
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
      // A rename restamps the note. Without this the next refresh would read
      // that as somebody else's write and reload the editor mid-sentence.
      if (saved.id === get().activeId) openedAt = saved.updated_at
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, ...saved } : n)),
        // The title moved, so links naming the old or new one just re-resolved.
        linksVersion: state.linksVersion + 1,
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
        openedAt = null
      }
      await deleteNote(id)
      set((state) => ({
        notes: state.notes.filter((n) => n.id !== id),
        // Links into the deleted note just became unresolved.
        linksVersion: state.linksVersion + 1,
        ...(state.activeId === id
          ? {
              activeId: null,
              content: '',
              saveStatus: 'idle' as SaveStatus,
              openNoteStale: null,
            }
          : {}),
      }))
    } catch (error) {
      set({ error: describeError(error) })
    }
  },

  setRenaming: (renamingId) => set({ renamingId }),
  dismissError: () => set({ error: null }),

  /**
   * Reconcile with the server. Called when the tab is looked at again, on a
   * timer while Realtime is not connected, and on every Realtime event — one
   * merge, whatever prompted it, so there is only one of these to get right.
   *
   * Nothing here is announced. A vault that quietly matches the server is the
   * point; the only thing worth interrupting anyone for is the one case this
   * cannot decide on its own, which is the open note changing under unsaved
   * edits.
   */
  refresh: async () => {
    // The initial load is already doing this, and better.
    if (get().loading) return

    let notes: NoteMeta[]
    try {
      notes = await listNotes()
    } catch {
      // Background work: the next event, focus, or tick tries again. Raising a
      // toast for a refresh nobody asked for would be worse than being quiet.
      return
    }

    // Only when something actually moved. Re-setting an identical list would
    // restart the graph's simulation and rebuild the tree every 45 seconds.
    if (fingerprint(notes) !== fingerprint(get().notes)) {
      set((state) => ({ notes, linksVersion: state.linksVersion + 1 }))
    }

    const { activeId, saveStatus } = get()
    if (!activeId) return

    const dirty = pendingWrite !== null || saveStatus === 'unsaved' || saveStatus === 'saving'
    const meta = notes.find((n) => n.id === activeId)

    if (!meta) {
      // Deleted somewhere else. Unsaved text is still the writer's, so it is
      // theirs to close rather than ours to throw away.
      if (dirty) hold(set, 'deleted')
      else get().closeOpenNote()
      return
    }

    if (openedAt === null || meta.updated_at === openedAt) return
    if (dirty) hold(set, 'changed')
    else await get().reloadOpenNote()
  },

  /** Take the server's copy of the open note, giving up anything queued. */
  reloadOpenNote: async () => {
    const id = get().activeId
    if (!id) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    pendingWrite = null
    try {
      const note = await fetchNote(id)
      openedAt = note.updated_at
      set((state) => ({
        content: note.content,
        contentVersion: state.contentVersion + 1,
        saveStatus: 'idle',
        openNoteStale: null,
      }))
    } catch (error) {
      set({ error: describeError(error) })
    }
  },

  /**
   * Keep typing, and let the pending save overwrite what arrived. Recording
   * the newer stamp is what stops the same change being flagged again on the
   * next refresh — the writer has already answered this one.
   */
  keepLocalEdits: () => {
    const { activeId, notes } = get()
    const meta = notes.find((n) => n.id === activeId)
    // Recording the newer stamp is what stops the same change being raised
    // again on the next refresh: this one has been answered.
    if (meta) openedAt = meta.updated_at
    set({ openNoteStale: null })
    void get().flush()
  },

  /** Let go of a note that no longer exists on the server. */
  closeOpenNote: () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    pendingWrite = null
    openedAt = null
    set({ activeId: null, content: '', saveStatus: 'idle', openNoteStale: null })
  },

  reset: () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    pendingWrite = null
    openedAt = null
    set((state) => ({
      notes: [],
      activeId: null,
      content: '',
      saveStatus: 'idle',
      error: null,
      renamingId: null,
      openNoteStale: null,
      // Bumped, not zeroed: the graph must drop one person's links on its way
      // to another's, and a counter that went backwards could land on a value
      // it had already seen.
      linksVersion: state.linksVersion + 1,
    }))
  },
}))
