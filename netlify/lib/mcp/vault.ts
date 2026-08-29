/**
 * The MCP server's data layer.
 *
 * Every call is a single PostgREST RPC against one of the pitchstone_mcp_*
 * functions. There is no service-role key here and no `user_id` anywhere in
 * this file: the database derives the owner from the credential itself, so
 * the worst a bug in this module can do is address the wrong note in the
 * *caller's own* vault.
 *
 * Two kinds of credential reach here now. A personal token (`pst_...`) is
 * opaque outside this database and is passed as `p_token`, exactly as
 * before. Anything else is treated as a bearer token issued by Tijamo-hub's
 * own OAuth 2.1 server (see identity.tijamo.app) and is handed to PostgREST
 * as the request's own Authorization header instead — its signature and
 * expiry are verified there, not here, and `p_token` goes across as null so
 * `pitchstone_token_user` falls back to `auth.uid()`.
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

/**
 * The OAuth 2.1 authorization server that issues the JWTs this module also
 * accepts — Tijamo-hub's own Supabase Auth, at the same project the anon key
 * above already points at. Exported for the protected-resource metadata
 * endpoint, which needs to advertise it.
 */
export function authorizationServer(): string {
  const { url } = connection()
  return `${url}/auth/v1`
}

export type VaultErrorKind = 'auth' | 'not-found' | 'conflict' | 'invalid' | 'ambiguous' | 'server'

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
  P0003: 'ambiguous', // pitchstone_note_id_for: more than one note matches
  '23505': 'conflict', // pitchstone_notes_path_unique
  '23514': 'invalid', // pitchstone_notes_path_valid
  '22P02': 'invalid', // malformed input to a parameter
}

function isPersonalToken(token: string): boolean {
  return token.startsWith('pst_')
}

/**
 * Reads a JWT's payload without verifying its signature — PostgREST does
 * that the moment the token is actually used below, so this is only ever a
 * cheap pre-filter, never what actually stands between an attacker and the
 * vault. Its one job is telling an OAuth-issued access token apart from an
 * ordinary Supabase session token that wandered into this header: only the
 * former carries a `client_id` claim, which is the only OAuth-specific thing
 * Supabase's default token shape gives us to check without installing a
 * Custom Access Token Hook to stamp a resource-scoped `aud`.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segment = token.split('.')[1]
  if (!segment) return null
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

async function rpc<T>(fn: string, token: string, args: Record<string, unknown>): Promise<T> {
  const { url, key } = connection()
  const personal = isPersonalToken(token)

  if (!personal) {
    const claims = decodeJwtPayload(token)
    if (!claims || typeof claims.client_id !== 'string') {
      // Rejected before it ever reaches PostgREST: a plain Supabase session
      // token (the app's own sign-in) has no client_id, and passing it
      // through here would be exactly the token-passthrough MCP forbids.
      throw new VaultError('That token is not valid for this vault.', 'auth')
    }
  }

  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${personal ? key : token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...args, p_token: personal ? token : null }),
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
    // A bad or expired OAuth JWT is rejected by PostgREST itself, before
    // pitchstone_token_user ever runs, with its own error shape rather than
    // one of the SQLSTATEs above — so any 401 here means "not authenticated",
    // regardless of what code (if any) came back.
    const kind = response.status === 401 ? 'auth' : (ERROR_KINDS[code] ?? 'server')
    throw new VaultError(message || response.statusText, kind)
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
  return rpc<VaultInfo>('pitchstone_mcp_vault_info', token, {})
}

export function listNotes(
  token: string,
  options: { folder?: string; tag?: string; limit?: number } = {},
): Promise<NoteSummary[]> {
  return rpc<NoteSummary[]>('pitchstone_mcp_list_notes', token, {
    p_folder: options.folder ?? null,
    p_tag: options.tag ?? null,
    p_limit: options.limit ?? null,
  })
}

/** `returns table` with one row, so the array is unwrapped here rather than
 * leaving every caller to remember that a note is not a list. */
export async function getNote(token: string, path: string): Promise<NoteDetail> {
  const rows = await rpc<NoteDetail[]>('pitchstone_mcp_get_note', token, {
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
  return rpc('pitchstone_mcp_search', token, {
    p_query: query,
    p_limit: limit ?? null,
  })
}

export type BacklinkSource = { path: string; title: string; content: string }

export function backlinks(token: string, path: string): Promise<BacklinkSource[]> {
  return rpc('pitchstone_mcp_backlinks', token, { p_path: path })
}

export function listTags(token: string): Promise<{ tag: string; uses: number }[]> {
  return rpc('pitchstone_mcp_tags', token, {})
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
  const rows = await rpc<WriteResult[]>('pitchstone_mcp_write_note', token, {
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
  const rows = await rpc<{ path: string; title: string }[]>('pitchstone_mcp_rename_note', token, {
    p_path: path,
    p_to: normalizePath(to),
  })
  if (rows.length === 0) throw new VaultError(`No note matching "${path}".`, 'not-found')
  return rows[0]
}

export function deleteNote(token: string, path: string): Promise<string> {
  return rpc<string>('pitchstone_mcp_delete_note', token, { p_path: path })
}
