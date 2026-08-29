/**
 * Deciding what a piece of text refers to — a `[[wikilink]]` target, an MCP
 * `path` argument, a name typed into the quick switcher — when the vault can
 * hold more than one note with the same title.
 *
 * A bare word ("gotchas") matches by title, the way it always has. Anything
 * with a `/` in it ("Pitchstone/gotchas") matches by the *trailing* segments
 * of a note's path, so a reference only needs to be as specific as the
 * ambiguity requires — never the full path from the vault root.
 *
 * This is the client-side mirror of `pitchstone_notes_matching` in SQL, which
 * is the one that actually decides what gets written or resolved. The two
 * must agree on the rule, the same way the two wikilink parsers must agree on
 * what counts as a link — this file has no database access, so it can only
 * ever be a preview of what the server will do, not a replacement for it.
 */

export type NoteRef = { title: string; path: string }

/** A note's path, without its extension, split into folder/file segments. */
export function pathSegments(path: string): string[] {
  return path.replace(/\.md$/i, '').split('/')
}

/**
 * Does `target` name this note? A bare word matches the title; a qualified
 * reference matches when the note's path ends with exactly those segments,
 * case-insensitively — so "Pitchstone/gotchas" matches
 * ".../Projects/Pitchstone/gotchas.md" but not ".../Someone/gotchas.md".
 */
export function targetMatchesNote(target: string, note: NoteRef): boolean {
  const trimmed = target.trim().replace(/\.md$/i, '')
  if (!trimmed) return false

  const wanted = trimmed.split('/')
  if (wanted.length === 1) {
    return note.title.toLowerCase() === wanted[0].toLowerCase()
  }

  const segments = pathSegments(note.path)
  if (wanted.length > segments.length) return false
  const tail = segments.slice(segments.length - wanted.length)
  return tail.every((segment, i) => segment.toLowerCase() === wanted[i].toLowerCase())
}

/** Every note `target` could mean. Empty, one, or more than one. */
export function matchNotesByTarget<T extends NoteRef>(notes: T[], target: string): T[] {
  return notes.filter((note) => targetMatchesNote(target, note))
}

/**
 * The note a link naming a *folder* should open, by the vault's own project
 * convention (`Memory/Projects/<Project>/state.md` — see CLAUDE.md): a
 * `[[Flowa]]` that names no note directly opens `Flowa/state.md` if the vault
 * has one, rather than the link sitting unresolved or a same-named note being
 * created alongside it. Reuses `matchNotesByTarget`'s own trailing-segment
 * rule by appending "/state" to the target, so a qualified "Projects/Flowa"
 * finds ".../Projects/Flowa/state.md" the same way "Pitchstone/gotchas" finds
 * a qualified note.
 */
export function matchFolderState<T extends NoteRef>(notes: T[], target: string): T[] {
  const trimmed = target.trim().replace(/\.md$/i, '').replace(/\/+$/, '')
  if (!trimmed) return []
  return matchNotesByTarget(notes, `${trimmed}/state`)
}

/**
 * The shortest trailing slice of `note`'s path that refers to it and nothing
 * else in `notes` — "gotchas" when the title is unique, "Pitchstone/gotchas"
 * when it is not. Used to write a link that will not need disambiguating
 * later, and to label a duplicate in a completion list.
 */
export function shortestUniqueSuffix<T extends NoteRef>(notes: T[], note: T): string {
  const segments = pathSegments(note.path)
  for (let n = 1; n <= segments.length; n++) {
    const suffix = segments.slice(segments.length - n).join('/')
    if (matchNotesByTarget(notes, suffix).length === 1) return suffix
  }
  return segments.join('/')
}

/** Titles (lower-cased) that more than one note in the list carries. */
export function duplicateTitles<T extends NoteRef>(notes: T[]): Set<string> {
  const counts = new Map<string, number>()
  for (const note of notes) {
    const key = note.title.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const duplicates = new Set<string>()
  for (const [title, count] of counts) {
    if (count > 1) duplicates.add(title)
  }
  return duplicates
}
