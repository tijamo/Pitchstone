import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Same shape as Dodo: both values come from the environment — `.env.local`
 * locally, Netlify env vars in production. The anon key is public by design;
 * it ships in the client bundle and RLS is what actually protects the data.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null

/**
 * Dodo falls back to a local-only mode when the keys are absent. Pitchstone
 * cannot: the vault *is* the database, and the MCP server reads the same rows.
 * So an unconfigured build says so plainly instead of pretending to work.
 */
export const isConfigured = supabase !== null

/**
 * For the data layer, which only ever runs behind the auth gate — and so only
 * ever runs when a client exists.
 */
export function db(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Pitchstone is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }
  return supabase
}
