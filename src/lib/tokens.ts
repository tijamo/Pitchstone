import { db } from './supabase'

/**
 * Personal access tokens for the MCP server.
 *
 * A token is generated in the browser and hashed in the browser: what leaves
 * this module for the database is a SHA-256 digest and the last four
 * characters, never the token itself. The raw value is returned to the caller
 * once, shown once, and then only exists wherever its owner pasted it. There
 * is deliberately no way to recover one — a lost token is replaced, not found.
 *
 * The MCP function sends the raw token back the other way and Postgres hashes
 * it there (pitchstone_token_user), so the two halves meet on the digest.
 */

export type ApiToken = {
  id: string
  name: string
  token_hint: string
  created_at: string
  last_used_at: string | null
}

const COLUMNS = 'id, name, token_hint, created_at, last_used_at'

/** `pst_` and 32 random bytes, base64url — 256 bits, unguessable and short
 * enough to paste on one line. The prefix makes a leaked one recognisable. */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const base64 = btoa(String.fromCharCode(...bytes))
  return `pst_${base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function listTokens(): Promise<ApiToken[]> {
  const { data, error } = await db()
    .from('pitchstone_api_tokens')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ApiToken[]
}

/**
 * Returns the new token's row *and* its raw value, which is the only time the
 * raw value exists anywhere outside the caller's clipboard.
 */
export async function createToken(name: string): Promise<{ token: ApiToken; secret: string }> {
  const secret = generateToken()
  const { data, error } = await db()
    .from('pitchstone_api_tokens')
    .insert({
      name: name.trim().slice(0, 64) || 'Claude',
      token_hash: await sha256Hex(secret),
      token_hint: secret.slice(-4),
    })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return { token: data as ApiToken, secret }
}

export async function revokeToken(id: string): Promise<void> {
  const { error } = await db().from('pitchstone_api_tokens').delete().eq('id', id)
  if (error) throw error
}
