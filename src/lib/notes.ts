import { db } from './supabase'
import {
  collectTags,
  dedupeLinks,
  excerptAround,
  extractLinks,
  parseFrontmatter,
} from './markdown/parse'
import { targetMatchesNote } from './markdown/resolve'

/**
 * Data access for the vault. Every query is scoped by RLS to the signed-in
 * user, so none of these filter on user_id themselves.
 *
 * Note *metadata* is loaded in one go (it is small, and the explorer, quick
 * switcher, and graph all need the full list), while *content* is fetched only
 * when a note is opened.
 */

export type NoteMeta = {
  id: string
  path: string
  title: string
  tags: string[]
  created_at: string
  updated_at: string
  /** A note this one nests under, from frontmatter — see paths.ts buildTree.
   * null when absent, unresolved, or naming more than one note. */
  parent: string | null
}

export type Note = NoteMeta & { content: string }

const META_COLUMNS = 'id, path, title, tags, created_at, updated_at, frontmatter'

/** The row shape META_COLUMNS actually selects — frontmatter raw, before
 * `parent` is picked out of it. */
type RawMeta = {
  id: string
  path: string
  title: string
  tags: string[]
  created_at: string
  updated_at: string
  frontmatter: unknown
}

function parentFrom(frontmatter: unknown): string | null {
  if (frontmatter && typeof frontmatter === 'object' && 'parent' in frontmatter) {
    const value = (frontmatter as { parent?: unknown }).parent
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function toMeta(row: RawMeta): NoteMeta {
  const { frontmatter, ...meta } = row
  return { ...meta, parent: parentFrom(frontmatter) }
}

function toNote(row: RawMeta & { content: string }): Note {
  const { content, ...rest } = row
  return { ...toMeta(rest), content }
}

export async function listNotes(): Promise<NoteMeta[]> {
  const { data, error } = await db()
    .from('pitchstone_notes')
    .select(META_COLUMNS)
    .order('path')
  if (error) throw error
  return (data ?? []).map((row) => toMeta(row as RawMeta))
}

/** Every note with its content, for export — the note list plus content is
 * the only way to write a full copy of the vault out to a file. */
export async function fetchAllNotes(): Promise<Note[]> {
  const { data, error } = await db()
    .from('pitchstone_notes')
    .select(`${META_COLUMNS}, content`)
    .order('path')
  if (error) throw error
  return (data ?? []).map((row) => toNote(row as RawMeta & { content: string }))
}

/** Batch insert for an import: chunked so a large vault doesn't go over in
 * one request, tags/frontmatter/links left for the next load's backfill to
 * derive rather than computed here — see "Derived data is rebuildable". */
export async function createNotes(rows: { path: string; content: string }[]): Promise<void> {
  const CHUNK_SIZE = 200
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await db()
      .from('pitchstone_notes')
      .insert(rows.slice(i, i + CHUNK_SIZE))
    if (error) throw error
  }
  // A batch of new notes can resolve links that were dangling, same as a
  // single create — see resolveLinks's own note on when to call it.
  await resolveLinks()
}

export async function fetchNote(id: string): Promise<Note> {
  const { data, error } = await db()
    .from('pitchstone_notes')
    .select(`${META_COLUMNS}, content`)
    .eq('id', id)
    .single()
  if (error) throw error
  return toNote(data as RawMeta & { content: string })
}

export async function createNote(path: string, content = ''): Promise<Note> {
  const { data, error } = await db()
    .from('pitchstone_notes')
    .insert({ path, content })
    .select(`${META_COLUMNS}, content`)
    .single()
  if (error) throw error
  // A new note may satisfy links that were unresolved until it existed.
  await resolveLinks()
  return toNote(data as RawMeta & { content: string })
}

/**
 * Writes a note's content along with everything derived from it: tags,
 * frontmatter, and outgoing links (re-synced wholesale, then resolved against
 * the rest of the vault). One round trip, atomic on the server.
 */
export async function saveContent(id: string, content: string): Promise<NoteMeta> {
  const { data, error } = await db().rpc('pitchstone_save_note', {
    p_note_id: id,
    p_content: content,
    p_tags: collectTags(content),
    p_frontmatter: parseFrontmatter(content).data,
    p_links: dedupeLinks(extractLinks(content)),
  })
  if (error) throw error
  // The RPC returns the full table row (public.pitchstone_notes), frontmatter
  // included, even though its TypeScript type only names NoteMeta's fields.
  return toMeta(data as unknown as RawMeta)
}

export async function renameNote(id: string, path: string): Promise<NoteMeta> {
  const { data, error } = await db()
    .from('pitchstone_notes')
    .update({ path })
    .eq('id', id)
    .select(META_COLUMNS)
    .single()
  if (error) throw error
  // The title changed with the path, so links pointing at either name shift.
  await resolveLinks()
  return toMeta(data as RawMeta)
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await db().from('pitchstone_notes').delete().eq('id', id)
  if (error) throw error
  await resolveLinks()
}

/**
 * Re-point every wikilink at the note whose title it names, and unpoint any
 * whose target no longer matches. Cheap enough to call after each structural
 * change that isn't already covered by saveContent's own resolve.
 */
export async function resolveLinks(): Promise<void> {
  const { error } = await db().rpc('pitchstone_resolve_links')
  if (error) throw error
}

export type Backlink = { note: NoteMeta; snippet: string | null }

/**
 * Every note whose [[wikilink]] resolves to `noteId`, each with a short
 * excerpt of the text around the link. One query for the link rows, one for
 * the source notes' content — cheap at vault scale, and avoids guessing at
 * PostgREST's embedded-join syntax for a table with two FKs to the same
 * parent.
 */
export async function fetchBacklinks(
  noteId: string,
  noteTitle: string,
  notePath: string,
): Promise<Backlink[]> {
  const { data: links, error } = await db()
    .from('pitchstone_links')
    .select('source_note_id')
    .eq('target_note_id', noteId)
  if (error) throw error

  const sourceIds = [...new Set((links ?? []).map((l) => l.source_note_id as string))]
  if (sourceIds.length === 0) return []

  const { data: sources, error: sourcesError } = await db()
    .from('pitchstone_notes')
    .select(`${META_COLUMNS}, content`)
    .in('id', sourceIds)
    .order('path')
  if (sourcesError) throw sourcesError

  const target = { title: noteTitle, path: notePath }
  return (sources ?? []).map((source) => {
    const { content, ...meta } = toNote(source as RawMeta & { content: string })
    // A folder-qualified link ("Pitchstone/gotchas") no longer matches this
    // note's bare title as a plain string, so the excerpt is found the same
    // way the link was resolved -- by path, not by string equality.
    const match = extractLinks(content).find((l) => targetMatchesNote(l.target, target))
    return { note: meta, snippet: match ? excerptAround(content, match.from, match.to) : null }
  })
}

export type LinkEdge = {
  source_note_id: string
  /** null when the link names a note that does not exist yet. */
  target_note_id: string | null
  target_title: string
}

/**
 * Every link in the vault, for the graph — including the unresolved ones. A
 * link to a note that has not been created yet is kept on purpose (see the
 * schema), so the graph can show it the way Obsidian does.
 */
export async function listLinks(): Promise<LinkEdge[]> {
  const { data, error } = await db()
    .from('pitchstone_links')
    .select('source_note_id, target_note_id, target_title')
  if (error) throw error
  return (data ?? []) as LinkEdge[]
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

/**
 * Notes whose derived data has never been built — everything written before
 * pitchstone_save_note existed, plus anything inserted with content directly.
 * Content comes back with them because the parse happens here, in the one
 * module that is allowed to do it.
 */
export async function fetchUnindexed(limit = 100): Promise<{ id: string; content: string }[]> {
  const { data, error } = await db()
    .from('pitchstone_notes')
    .select('id, content')
    .is('indexed_at', null)
    .limit(limit)
  if (error) throw error
  return (data ?? []) as { id: string; content: string }[]
}

/** Rebuild one note's tags, frontmatter, and links without touching its text. */
export async function reindexNote(id: string, content: string): Promise<void> {
  const { error } = await db().rpc('pitchstone_reindex_note', {
    p_note_id: id,
    p_tags: collectTags(content),
    p_frontmatter: parseFrontmatter(content).data,
    p_links: dedupeLinks(extractLinks(content)),
  })
  if (error) throw error
}

/**
 * One-time catch-up pass, run on vault load. Returns how many notes it
 * indexed, so the caller knows whether the note list is now stale. Batched
 * rather than unbounded: a large vault catches up over a few loads instead of
 * blocking the first one.
 */
export async function backfillIndex(): Promise<number> {
  const pending = await fetchUnindexed()
  let done = 0
  for (const note of pending) {
    try {
      await reindexNote(note.id, note.content)
      done++
    } catch {
      // One unparseable note must not stop the rest of the vault catching up.
    }
  }
  return done
}

export type SearchResult = { id: string; path: string; title: string; snippet: string }

/**
 * Full-text search over title and content via the `search` tsvector column.
 * The snippet comes back delimited with \x01/\x02 rather than HTML — see the
 * migration — so the caller renders highlights as text, not raw markup.
 */
export async function searchNotes(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await db().rpc('pitchstone_search_notes', { q })
  if (error) throw error
  return (data ?? []) as SearchResult[]
}

/** Turn a Supabase error into something worth showing a person. */
export function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as { code?: string; message?: string }
    if (e.code === '23505') return 'A note with that name already exists here.'
    if (e.code === '23514') return 'That name contains characters the vault cannot use.'
    if (e.message) return e.message
  }
  return 'Something went wrong.'
}
