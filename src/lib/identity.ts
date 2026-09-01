/**
 * Tijamo's shared identity site — the one place every app's auth emails land.
 *
 * A password-reset link cannot come back to Pitchstone: the link *is* a
 * session, and consuming it has to happen wherever Supabase was told to send
 * it. Every Tijamo app shares one Supabase project and one set of auth users,
 * so that landing page belongs to all of them rather than to any one — it is
 * a sibling site (repo `tijamo/identity`), not a route in here.
 *
 * `?app=pitchstone` is how that page knows to offer the way back. It matches
 * the id against its own list of apps and never follows a URL from the query
 * string, so naming ourselves here is a hint, not a redirect.
 */
export const IDENTITY_URL = 'https://identity.tijamo.app'

/**
 * Where a reset email should land. Supabase only honours a `redirectTo` that
 * its own allowlist covers; anything else falls back to the project's Site
 * URL — which is this same site, so a missing allowlist entry costs the
 * "Back to Pitchstone" link and nothing else.
 */
export const PASSWORD_RESET_REDIRECT = `${IDENTITY_URL}/auth/confirm?app=pitchstone`
