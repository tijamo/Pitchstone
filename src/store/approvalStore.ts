import type { RealtimeChannel } from '@supabase/supabase-js'
import { create } from 'zustand'
import { db } from '../lib/supabase'
import { POLL_MS } from '../lib/live'
import {
  decideAccount,
  fetchMyApproval,
  fetchPendingAccounts,
  type ApprovalStatus,
  type PendingAccount,
} from '../lib/approvals'

type ApprovalState = {
  /** null until the first check has actually run — never assumed approved. */
  status: ApprovalStatus | null
  isOwner: boolean
  pending: PendingAccount[]
  /** Subscribes and does the first fetch; call the return value to stop. */
  init: (userId: string) => () => void
  approve: (userId: string) => Promise<void>
  reject: (userId: string) => Promise<void>
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  status: null,
  isOwner: false,
  pending: [],

  init: (userId) => {
    set({ status: null, isOwner: false, pending: [] })
    void refresh(userId, set, get)

    // One row per signed-in user is visible here — RLS limits a member's own
    // channel to their own row and the owner's to every row, the same way it
    // limits a plain select, so no filter is needed to keep the two apart.
    let channel: RealtimeChannel | null = null
    try {
      channel = db()
        .channel(`tijamo-approvals:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tijamo_user_approvals' },
          (payload) => {
            void refresh(userId, set, get)
            if (get().isOwner && payload.eventType === 'INSERT') {
              const row = payload.new as { status?: string; email?: string }
              if (row.status === 'pending') notifyNewSignup(row.email)
            }
          },
        )
        .subscribe()
    } catch {
      // Realtime being unavailable is caught here, but a connection that
      // fails *after* subscribe() (see the poll below) is not — this only
      // covers the synchronous case.
    }

    // Belt and braces, same as the vault's own live watcher: a tab that was
    // backgrounded when a decision or a new signup landed catches up the
    // moment it's looked at again, and a slow tick covers a socket that never
    // connects at all (documented as untested against real Supabase — see
    // CLAUDE.md). The table is tiny, so polling it regardless of socket
    // status is cheap enough not to bother tracking 'live' separately.
    const catchUp = () => {
      if (document.visibilityState === 'visible') void refresh(userId, set, get)
    }
    window.addEventListener('focus', catchUp)
    document.addEventListener('visibilitychange', catchUp)
    const timer = setInterval(catchUp, POLL_MS)

    return () => {
      if (channel) void db().removeChannel(channel)
      window.removeEventListener('focus', catchUp)
      document.removeEventListener('visibilitychange', catchUp)
      clearInterval(timer)
    }
  },

  approve: async (userId) => {
    await decideAccount(userId, 'approved')
    set((s) => ({ pending: s.pending.filter((p) => p.user_id !== userId) }))
  },

  reject: async (userId) => {
    await decideAccount(userId, 'rejected')
    set((s) => ({ pending: s.pending.filter((p) => p.user_id !== userId) }))
  },
}))

async function refresh(
  userId: string,
  set: (partial: Partial<ApprovalState>) => void,
  get: () => ApprovalState,
) {
  const row = await fetchMyApproval(userId).catch(() => null)
  // A missing row is treated as pending, not approved: tijamo_handle_new_user
  // guarantees one exists for every real signup, so its absence is a sign
  // something is wrong rather than a reason to wave the account through.
  const status: ApprovalStatus = row?.status ?? 'pending'
  const isOwner = row?.role === 'owner' && row?.status === 'approved'
  set({ status, isOwner })

  if (isOwner) {
    requestNotifyPermission()
    const pending = await fetchPendingAccounts().catch(() => [])
    // A member who lost owner status between the two awaits above must not
    // have their view clobbered by a fetch made on their old permissions.
    if (get().isOwner) set({ pending })
  } else {
    set({ pending: [] })
  }
}

function requestNotifyPermission() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
  void Notification.requestPermission()
}

/** The one place this feature "pops a notification" — a real OS/browser one,
 * while the owner has Pitchstone open, on top of the in-app badge. */
function notifyNewSignup(email: string | undefined) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  new Notification('New Pitchstone sign-up', {
    body: email ? `${email} is waiting for approval.` : 'Someone is waiting for approval.',
    icon: '/icon-192.png',
  })
}
