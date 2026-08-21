import type { RealtimeChannel } from '@supabase/supabase-js'
import { db } from './supabase'

/**
 * Live updates for the vault.
 *
 * These notes are not only edited here. Claude writes to the same rows through
 * the MCP server, and the app may well be open on a phone as well as a laptop,
 * so a tab that only ever showed what it loaded at sign-in is showing a guess.
 * This subscribes to the signed-in user's own rows in `pitchstone_notes` and
 * says when any of them move.
 *
 * The callback is deliberately told *nothing about what changed*. Reconciling
 * against the server is cheap — note metadata, not content — and it is the
 * same path the focus refresh and the fallback poll take, so there is one
 * merge to get right instead of three.
 */

/** How often to reconcile by hand while the socket is not up. */
export const POLL_MS = 45_000

/** Several writes in a row (a rename, a save, a resolve) are one refresh. */
const DEBOUNCE_MS = 250

export type LiveStatus = 'live' | 'offline'

export function watchVault(
  userId: string,
  onChange: () => void,
  onStatus: (status: LiveStatus) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, DEBOUNCE_MS)
  }

  let channel: RealtimeChannel | null = null
  try {
    channel = db()
      .channel(`pitchstone:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pitchstone_notes',
          // Belt and braces: RLS already keeps one vault out of another's
          // stream, and this keeps the socket quiet as well as safe.
          filter: `user_id=eq.${userId}`,
        },
        schedule,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          onStatus('live')
          // Whatever happened while the socket was down is not replayed, so
          // subscribing is also the moment to catch up.
          schedule()
        } else {
          onStatus('offline')
        }
      })
  } catch {
    // Realtime being unavailable is not an error the writer needs to see: the
    // poll below carries on without it.
    onStatus('offline')
  }

  return () => {
    if (timer) clearTimeout(timer)
    if (channel) void db().removeChannel(channel)
  }
}
