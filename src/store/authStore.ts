import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

type AuthState = {
  session: Session | null
  /** True until the stored session has been checked, so we don't flash a login form. */
  loading: boolean
  sending: boolean
  sentTo: string | null
  error: string | null
  init: () => () => void
  signIn: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  loading: true,
  sending: false,
  sentTo: null,
  error: null,

  init: () => {
    void supabase.auth
      .getSession()
      .then(({ data }) => set({ session: data.session, loading: false }))

    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      set({ session, loading: false }),
    )
    return () => data.subscription.unsubscribe()
  },

  signIn: async (email) => {
    set({ sending: true, error: null, sentTo: null })
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    set({
      sending: false,
      sentTo: error ? null : email,
      error: error ? error.message : null,
    })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, sentTo: null })
  },
}))
