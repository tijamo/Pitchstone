/**
 * The MCP server's data layer.
 *
 * Every call is a single PostgREST RPC against one of the pitchstone_mcp_*
 * functions, with the personal token as the first argument. There is no
 * service-role key here and no `user_id` anywhere in this file: the database
 * derives the owner from the token itself, so the worst a bug in this module
 * can do is address the wrong note in the *caller's own* vault.
 *
 * Plain fetch rather than @supabase/supabase-js: nine RPC calls and no auth,
 * realtime, or storage, so the client would be several hundred kilobytes of
 * cold-start for a POST and a JSON parse.
 */
import {
  collectTags,
  dedupeLinks,
  extractLinks,
  parseFrontmatter,
} from '../../../src/lib/markdown/parse.ts'
import { sanitizeSegment } from '../../../src/lib/paths.ts'

/**
 * The same two variables the browser build uses — the anon key is public by
 * design, and the pitchstone_mcp_* functions are the only thing it can reach
 * without a signed-in session. VITE_-less names are accepted so the function
 * keeps working if the site ever stops prefixing them.
 *
 * Read per call rather than at import: a value captured at module scope is
 * fixed for the life of the container, and cannot be set by a test.
 */
function connection(): { url: string; key: string } {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new VaultError(
      'Pitchstone is not configured: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
        'must be set on the site.',
      'server',
    )
  }
  return { url, key }
}

export type VaultErrorKind = 'auth' | 'not-found' | 'conflict' | 'invalid' | 'server'

export class VaultError extends Error {
  // Written out rather than declared as a constructor parameter property:
  // Node's type stripping runs this file directly for the tests, and it
  // erases types without rewriting anything.
  readonly kind: VaultErrorKind

  constructor(message: string, kind: VaultErrorKind) {
    super(message)
    this.name = 'VaultError'
    this.kind = kind
  }
}

/** Postgres SQLSTATEs the MCP functions and the schema's constraints raise. */
const ERROR_KINDS: Record<string, VaultErrorKind> = {
  '28000': 'auth', // pitchstone_token_user: the token is not one of ours
  P0002: 'not-found', // no note matching the path or title given
  '23505': 'conflict', // pitchstone_notes_path_unique
  '23514': 'invalid', // pitchstone_notes_path_valid
  '22P02': 'invalid', // malformed input to a parameter
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { url, key } = connection()

  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  })

  const body = await response.text()
  if (!response.ok) {
    let code = ''
    let message = body
    try {
      const parsed = JSON.parse(body) as { code?: string; message?: string }
      code = parsed.code ?? ''
      message = parsed.message ?? body
    } catch {
      // A non-JSON body means something upstream of PostgREST answered.
    }
    throw new VaultError(message || response.statusText, ERROR_KINDS[code] ?? 'server')
  }

  return JSON.parse(body) as T
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Turn whatever an MCP client asked for into a path the vault will accept:
 * vault-relative, `/`-separated, `.md`-suffixed, with the characters a note
 * name cannot hold stripped by the same rule the app's rename box uses.
 *
 * Deliberately permissive, because the caller is a language model writing a
 * path from memory. Rejecting `Memory/Today` for want of an extension would
 * only teach it to guess again.
 */
export function normalizePath(input: string): string {
  const segments = input
    .trim()
    .replace(/\.md$/i, '')
    .split('/')
    .map(sanitizeSegment)
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')

  if (segments.length === 0) {
    throw new VaultError(`"${input}" is not a usable note path.`, 'invalid')
  }
  return `${segments.join('/')}.md`
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type NoteSummary = {
  path: string
  title: string
  tags: string[]
  chars: number
  created_at: string
  updated_at: string
}

export type NoteDetail = {
  path: string
  title: string
  content: string
  tags: string[]
  frontmatter: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type VaultInfo = {
  notes: number
  links: number
  tags: number
  last_updated: string | null
  folders: string[]
  /** Titles that are linked to from somewhere but have no note yet. */
  unwritten: string[]
}

export function vaultInfo(token: string): Promise<VaultInfo> {
  return rpc<VaultInfo>('pitchstone_mcp_vault_info', { p_token: token })
}

export function listNotes(
  token: string,
  options: { folder?: string; tag?: string; limit?: number } = {},
): Promise<NoteSummary[]> {
  return rpc<NoteSummary[]>('pitchstone_mcp_list_notes', {
    p_token: token,
    p_folder: options.folder ?? null,
    p_tag: options.tag ?? null,
    p_limit: options.limit ?? null,
  })
}

/** `returns table` with one row, so the array is unwrapped here rather than
 * leaving every caller to remember that a note is not a list. */
export async function getNote(token: string, path: string): Promise<NoteDetail> {
  const rows = await rpc<NoteDetail[]>('pitchstone_mcp_get_note', {
    p_token: token,
    p_path: path,
  })
  if (rows.length === 0) throw new VaultError(`No note matching "${path}".`, 'not-found')
  return rows[0]
}

export function searchNotes(
  token: string,
  query: string,
  limit?: number,
): Promise<{ path: string; title: string; snippet: string }[]> {
  return rpc('pitchstone_mcp_search', {
    p_token: token,
    p_query: query,
    p_limit: limit ?? null,
  })
}

export type BacklinkSource = { path: string; title: string; content: string }

export function backlinks(token: string, path: string): Promise<BacklinkSource[]> {
  return rpc('pitchstone_mcp_backlinks', { p_token: token, p_path: path })
}

export function listTags(token: string): Promise<{ tag: string; uses: number }[]> {
  return rpc('pitchstone_mcp_tags', { p_token: token })
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type WriteResult = {
  path: string
  title: string
  created: boolean
  updated_at: string
}

/**
 * Create or overwrite a note, along with everything derived from its text.
 *
 * The derivation happens *here*, in TypeScript, using the same module the
 * editor uses — see src/lib/markdown/parse.ts. That is the whole reason
 * extraction was kept out of SQL: the vault has one parser, and a note written
 * by Claude carries exactly the tags and links it would have carried had it
 * been typed into the app.
 */
export async function writeNote(
  token: string,
  path: string,
  content: string,
): Promise<WriteResult> {
  const rows = await rpc<WriteResult[]>('pitchstone_mcp_write_note', {
    p_token: token,
    p_path: normalizePath(path),
    p_content: content,
    p_tags: collectTags(content),
    p_frontmatter: parseFrontmatter(content).data,
    p_links: dedupeLinks(extractLinks(content)),
  })
  return rows[0]
}

export async function renameNote(
  token: string,
  path: string,
  to: string,
): Promise<{ path: string; title: string }> {
  const rows = await rpc<{ path: string; title: string }[]>('pitchstone_mcp_rename_note', {
    p_token: token,
    p_path: path,
    p_to: normalizePath(to),
  })
  if (rows.length === 0) throw new VaultError(`No note matching "${path}".`, 'not-found')
  return rows[0]
}

export function deleteNote(token: string, path: string): Promise<string> {
  return rpc<string>('pitchstone_mcp_delete_note', { p_token: token, p_path: path })
}
