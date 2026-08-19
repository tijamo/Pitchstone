import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export type AuthMode = 'signin' | 'signup'

type AuthState = {
  session: Session | null
  /** True until the stored session has been checked, so we don't flash a form. */
  loading: boolean
  mode: AuthMode
  busy: boolean
  error: string | null
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

  init: () => {
    if (!supabase) {
      set({ loading: false })
      return () => {}
    }
    const sb = supabase

    void sb.auth.getSession().then(({ data }) => set({ session: data.session, loading: false }))

    const { data } = sb.auth.onAuthStateChange((_event, session) =>
      set({ session, loading: false }),
    )
    return () => data.subscription.unsubscribe()
  },

  setMode: (mode) => set({ mode, error: null }),

  submit: async (email, password) => {
    if (!supabase) return
    const sb = supabase
    const trimmed = email.trim()
    if (!trimmed || !password) return

    set({ busy: true, error: null })
    const mode = get().mode
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
