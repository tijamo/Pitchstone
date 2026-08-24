import { db } from './supabase'

/**
 * Data access for the shared Tijamo user-approval queue — see the migration
 * comment on `tijamo_user_approvals` for why it isn't a `pitchstone_*` table.
 * Every query here is scoped by that table's own RLS: a member sees only
 * their own row, the owner sees every row.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type ApprovalRole = 'owner' | 'member'

export type PendingAccount = {
  user_id: string
  email: string
  requested_at: string
}

/** The signed-in user's own row, or null if none exists yet. */
export async function fetchMyApproval(
  userId: string,
): Promise<{ status: ApprovalStatus; role: ApprovalRole } | null> {
  const { data, error } = await db()
    .from('tijamo_user_approvals')
    .select('status, role')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data as { status: ApprovalStatus; role: ApprovalRole } | null
}

/** Every account still waiting on a decision. Owner-only under RLS. */
export async function fetchPendingAccounts(): Promise<PendingAccount[]> {
  const { data, error } = await db()
    .from('tijamo_user_approvals')
    .select('user_id, email, requested_at')
    .eq('status', 'pending')
    .order('requested_at')
  if (error) throw error
  return (data ?? []) as PendingAccount[]
}

/**
 * Approve or reject a pending account. Approving unlocks every Tijamo app
 * sharing this Supabase project, not just Pitchstone — the queue is one
 * shared table (see the migration), Pitchstone is just the app that enforces
 * it today.
 */
export async function decideAccount(
  userId: string,
  status: 'approved' | 'rejected',
): Promise<void> {
  const { error } = await db().rpc('tijamo_decide_user', { p_user_id: userId, p_status: status })
  if (error) throw error
}
