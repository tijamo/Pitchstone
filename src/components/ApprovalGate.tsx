import { useEffect, type ReactNode } from 'react'
import { useAuthStore } from '../store/authStore'
import { useApprovalStore } from '../store/approvalStore'
import { Mark } from './Mark'

/**
 * Sits inside LoginGate: a session alone is no longer enough to see the
 * vault. A new signup lands here pending until the owner approves it in
 * Settings → User management — approval that unlocks every Tijamo app
 * sharing this Supabase project, not only Pitchstone.
 */
export function ApprovalGate({ children }: { children: ReactNode }) {
  const userId = useAuthStore((s) => s.session?.user.id)
  const email = useAuthStore((s) => s.session?.user.email)
  const signOut = useAuthStore((s) => s.signOut)
  const status = useApprovalStore((s) => s.status)
  const init = useApprovalStore((s) => s.init)

  useEffect(() => {
    if (!userId) return
    return init(userId)
  }, [userId, init])

  if (!userId || status === null) {
    return (
      <div className="gate">
        <div className="gate__loading">
          <Mark size={40} />
          <span className="gate__pending">Checking your access…</span>
        </div>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="gate">
        <div className="gate__card">
          <div className="gate__brand">
            <Mark size={44} />
            <h1 className="gate__title">Waiting for approval</h1>
          </div>
          <p className="gate__sub">
            {email ?? 'This account'} still needs the owner to approve it. Once approved, it has
            access to Pitchstone and every other Tijamo app on this account.
          </p>
          <button className="gate__ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="gate">
        <div className="gate__card">
          <div className="gate__brand">
            <Mark size={44} />
            <h1 className="gate__title">Access declined</h1>
          </div>
          <p className="gate__sub">This account has not been approved to use Pitchstone.</p>
          <button className="gate__ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
