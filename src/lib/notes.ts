import { db } from './supabase'
import { collectTags, extractLinks, parseFrontmatter, type ExtractedLink } from './markdown/parse'

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
}

export type Note = NoteMeta & { content: string }

const META_COLUMNS = 'id, path, title, tags, created_at, updated_at'

export async function listNotes(): Promise<NoteMeta[]> {
  const { data, error } = await db()
    .from('pitchstone_notes')
    .select(META_COLUMNS)
    .order('path')
  if (error) throw error
  return data ?? []
}

export async function fetchNote(id: string): Promise<Note> {
  const { data, error } = await db()
    .from('pitchstone_notes')
    .select(`${META_COLUMNS}, content`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Note
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
  return data as Note
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
  return data as NoteMeta
}

/** The links table has a unique (source, target_title, link_type) — a target
 * mentioned twice in one note must only be written once. */
function dedupeLinks(links: ExtractedLink[]): { target: string; type: string }[] {
  const seen = new Set<string>()
  const deduped: { target: string; type: string }[] = []
  for (const link of links) {
    const key = `${link.type}:${link.target}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({ target: link.target, type: link.type })
  }
  return deduped
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
  return data as NoteMeta
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
export async function fetchBacklinks(noteId: string, noteTitle: string): Promise<Backlink[]> {
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

  const wanted = noteTitle.toLowerCase()
  return (sources ?? []).map((source) => {
    const { content, ...meta } = source as Note
    const match = extractLinks(content).find((l) => l.target.toLowerCase() === wanted)
    return { note: meta, snippet: match ? excerpt(content, match.from, match.to) : null }
  })
}

function excerpt(content: string, from: number, to: number, radius = 60): string {
  const start = Math.max(0, from - radius)
  const end = Math.min(content.length, to + radius)
  const text = content.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${text}${end < content.length ? '…' : ''}`
}

export type LinkEdge = { source_note_id: string; target_note_id: string }

/** Every link that currently resolves to a note, for the graph view. */
export async function listResolvedLinks(): Promise<LinkEdge[]> {
  const { data, error } = await db()
    .from('pitchstone_links')
    .select('source_note_id, target_note_id')
    .not('target_note_id', 'is', null)
  if (error) throw error
  return (data ?? []) as LinkEdge[]
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
