import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from '../store/authStore'
import { isConfigured } from '../lib/supabase'

/**
 * Email and password, the same model Dodo uses — one form with a sign-in ⇄
 * create-account toggle, and no magic links. Everything past this gate needs a
 * session, because the vault is RLS-scoped.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const { session, loading, mode, busy, error, init, setMode, submit } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => init(), [init])

  if (!isConfigured) {
    return (
      <div className="gate">
        <div className="gate__card">
          <h1 className="gate__title">Pitchstone isn’t configured</h1>
          <p className="gate__sub">
            This build has no vault to talk to. Set{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
            in the environment, then redeploy.
          </p>
          <p className="gate__version">v{__APP_VERSION__}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="gate">
        <span className="gate__pending">Restoring your session…</span>
      </div>
    )
  }

  if (session) return <>{children}</>

  const signingUp = mode === 'signup'

  return (
    <div className="gate">
      <form
        className="gate__card"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(email, password)
        }}
      >
        <h1 className="gate__title">Pitchstone</h1>
        <p className="gate__sub">
          {signingUp
            ? 'Set a password to sync your vault across devices.'
            : 'Sign in to open your vault.'}
        </p>

        <label className="gate__label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="gate__input"
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="gate__label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="gate__input"
          type="password"
          required
          minLength={6}
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          className="gate__button"
          type="submit"
          disabled={busy || !email.trim() || !password}
        >
          {busy ? '…' : signingUp ? 'Create account' : 'Sign in'}
        </button>

        <button
          className="gate__ghost"
          type="button"
          onClick={() => setMode(signingUp ? 'signin' : 'signup')}
        >
          {signingUp
            ? 'Already have an account? Sign in'
            : 'First time? Create your account'}
        </button>

        {error && <p className="gate__error">{error}</p>}

        <p className="gate__version">v{__APP_VERSION__}</p>
      </form>
    </div>
  )
}
