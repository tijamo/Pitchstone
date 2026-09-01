import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { PASSWORD_RESET_REDIRECT } from '../lib/identity'

/**
 * 'reset' is the same card with the password field taken away: an email
 * address is all a reset needs, and sending someone to a separate page to
 * type one they have already typed is a step for its own sake.
 */
export type AuthMode = 'signin' | 'signup' | 'reset'

type AuthState = {
  session: Session | null
  /** True until the stored session has been checked, so we don't flash a form. */
  loading: boolean
  mode: AuthMode
  busy: boolean
  error: string | null
  /** Something that went right and needs saying — a reset email being sent
   * is the only case, and it has no other way to show. */
  notice: string | null
  init: () => () => void
  setMode: (mode: AuthMode) => void
  submit: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  loading: true,
  mode: 'signin',
  busy: false,
  error: null,
  notice: null,

  init: () => {
    if (!supabase) {
      set({ loading: false })
      return () => {}
    }
    const sb = supabase

    // getSession() reads a stored session and, if it looks stale, refreshes
    // it over the network — a call with no timeout of its own. A hung
    // service worker (an installed PWA is the case most exposed to this,
    // between one update finishing its precache and actually activating) can
    // leave that hanging indefinitely, which otherwise strands the sign-in
    // gate on "Restoring your session…" with no way out but clearing storage.
    // Falling through to the sign-in form is always safe: a session that
    // does arrive late still lands via onAuthStateChange below, and one that
    // never does just means signing in again, same as if it had failed
    // outright.
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      set({ loading: false })
    }, 8000)

    void sb.auth.getSession().then(({ data }) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      set({ session: data.session, loading: false })
    })

    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      settled = true
      clearTimeout(timeout)
      set({ session, loading: false })
    })
    return () => {
      clearTimeout(timeout)
      data.subscription.unsubscribe()
    }
  },

  setMode: (mode) => set({ mode, error: null, notice: null }),

  submit: async (email, password) => {
    if (!supabase) return
    const sb = supabase
    const trimmed = email.trim()
    const mode = get().mode
    if (!trimmed || (mode !== 'reset' && !password)) return

    set({ busy: true, error: null, notice: null })

    if (mode === 'reset') {
      // The redirect names this app so the landing page can offer the way
      // back; see lib/identity.ts for what happens if Supabase declines it.
      const { error } = await sb.auth.resetPasswordForEmail(trimmed, {
        redirectTo: PASSWORD_RESET_REDIRECT,
      })
      set({ busy: false })
      if (error) {
        set({ error: error.message })
        return
      }
      // Deliberately says "if": answering differently for an address that has
      // an account and one that doesn't turns this form into a way of asking
      // whether somebody has one.
      set({
        notice: `If ${trimmed} has an account, a link to set a new password is on its way. It opens Tijamo's own sign-in page, which every Tijamo app shares — set a password there, then come back and sign in.`,
      })
      return
    }

    const { data, error } =
      mode === 'signup'
        ? await sb.auth.signUp({ email: trimmed, password })
        : await sb.auth.signInWithPassword({ email: trimmed, password })
    set({ busy: false })

    if (error) {
      set({ error: error.message })
      return
    }

    // With "Confirm email" off, signUp returns a session straight away. If it
    // does not, confirmation is still on — point at the setting rather than
    // leaving the user waiting for an email that changes nothing here.
    if (mode === 'signup' && !data.session) {
      set({
        mode: 'signin',
        error:
          'Account created, but "Confirm email" is still on in Supabase. Turn it off, then sign in.',
      })
    }
  },

  signOut: async () => {
    if (supabase) await supabase.auth.signOut()
    set({ session: null, error: null })
  },
}))
