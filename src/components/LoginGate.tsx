import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from '../store/authStore'

/**
 * Everything in Pitchstone needs a signed-in user, because the vault is
 * RLS-scoped. This gate renders the app only once a session exists.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const { session, loading, sending, sentTo, error, init, signIn } = useAuthStore()
  const [email, setEmail] = useState('')

  useEffect(() => init(), [init])

  if (loading) {
    return (
      <div className="gate">
        <span className="gate__pending">Restoring your session…</span>
      </div>
    )
  }

  if (session) return <>{children}</>

  return (
    <div className="gate">
      <form
        className="gate__card"
        onSubmit={(e) => {
          e.preventDefault()
          if (email.trim()) void signIn(email.trim())
        }}
      >
        <h1 className="gate__title">Pitchstone</h1>
        <p className="gate__sub">
          Connected notes, wherever you are. Sign in with a link sent to your
          email — no password to remember.
        </p>

        {sentTo ? (
          <p className="gate__sent">
            Link sent to <strong>{sentTo}</strong>. Open it on this device to
            finish signing in.
          </p>
        ) : (
          <>
            <input
              className="gate__input"
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
            />
            <button className="gate__button" type="submit" disabled={sending}>
              {sending ? 'Sending…' : 'Email me a link'}
            </button>
          </>
        )}

        {error && <p className="gate__error">{error}</p>}
      </form>
    </div>
  )
}
