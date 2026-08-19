import { useEffect } from 'react'
import { Ribbon } from './components/Ribbon'
import { LeftSidebar } from './components/LeftSidebar'
import { EditorPane } from './components/EditorPane'
import { RightSidebar } from './components/RightSidebar'
import { StatusBar } from './components/StatusBar'
import { LoginGate } from './components/LoginGate'
import { SettingsModal } from './components/SettingsModal'
import { useUiStore } from './store/uiStore'
import { useAuthStore } from './store/authStore'
import { useVaultStore } from './store/vaultStore'

export function App() {
  const theme = useUiStore((s) => s.theme)

  // No stored preference means "follow the OS", which the CSS handles on its
  // own — so the attribute is removed rather than set to a resolved value.
  useEffect(() => {
    const root = document.documentElement
    if (theme) root.setAttribute('data-theme', theme)
    else root.removeAttribute('data-theme')
  }, [theme])

  return (
    <LoginGate>
      <Vault />
    </LoginGate>
  )
}

function Vault() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const load = useVaultStore((s) => s.load)
  const reset = useVaultStore((s) => s.reset)
  const flush = useVaultStore((s) => s.flush)
  const error = useVaultStore((s) => s.error)
  const dismissError = useVaultStore((s) => s.dismissError)

  // Reload from scratch whenever the signed-in user changes, so one person's
  // vault can never linger on screen for another.
  useEffect(() => {
    reset()
    void load()
  }, [userId, load, reset])

  // A queued autosave would otherwise be lost on a close or reload.
  useEffect(() => {
    const onLeave = () => void flush()
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      void flush()
    }
  }, [flush])

  return (
    <div className="shell">
      <Ribbon />
      <LeftSidebar />
      <EditorPane />
      <RightSidebar />
      <StatusBar />
      <SettingsModal />
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button className="toast__dismiss" onClick={dismissError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
