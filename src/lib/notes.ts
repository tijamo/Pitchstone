import { supabase } from './supabase'

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
  created_at: string
  updated_at: string
}

export type Note = NoteMeta & { content: string }

const META_COLUMNS = 'id, path, title, created_at, updated_at'

export async function listNotes(): Promise<NoteMeta[]> {
  const { data, error } = await supabase
    .from('pitchstone_notes')
    .select(META_COLUMNS)
    .order('path')
  if (error) throw error
  return data ?? []
}

export async function fetchNote(id: string): Promise<Note> {
  const { data, error } = await supabase
    .from('pitchstone_notes')
    .select(`${META_COLUMNS}, content`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Note
}

export async function createNote(path: string, content = ''): Promise<Note> {
  const { data, error } = await supabase
    .from('pitchstone_notes')
    .insert({ path, content })
    .select(`${META_COLUMNS}, content`)
    .single()
  if (error) throw error
  // A new note may satisfy links that were unresolved until it existed.
  await resolveLinks()
  return data as Note
}

export async function saveContent(id: string, content: string): Promise<NoteMeta> {
  const { data, error } = await supabase
    .from('pitchstone_notes')
    .update({ content })
    .eq('id', id)
    .select(META_COLUMNS)
    .single()
  if (error) throw error
  return data as NoteMeta
}

export async function renameNote(id: string, path: string): Promise<NoteMeta> {
  const { data, error } = await supabase
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
  const { error } = await supabase.from('pitchstone_notes').delete().eq('id', id)
  if (error) throw error
  await resolveLinks()
}

/**
 * Re-point every wikilink at the note whose title it names, and unpoint any
 * whose target no longer matches. Cheap enough to call after each structural
 * change; it is a no-op until Phase 3 starts writing links.
 */
export async function resolveLinks(): Promise<void> {
  const { error } = await supabase.rpc('pitchstone_resolve_links')
  if (error) throw error
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
