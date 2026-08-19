import { createClient } from '@supabase/supabase-js'

/**
 * The vault lives in the shared Tijamo-hub Supabase project, alongside every
 * other Tijamo app, in `pitchstone_*` tables under RLS.
 *
 * Both values below are public by design — the publishable key grants only
 * what RLS allows, and it ships in the client bundle regardless — so they are
 * committed as defaults and the Netlify env vars override them if the project
 * ever moves.
 */
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://tpewzbkcmpttrhiuxwqp.supabase.co'
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_YFrpaoo8vhdFV2mXBSgV2w_q_u0ypOl'

export const supabase = createClient(url, publishableKey)
