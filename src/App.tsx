import { useEffect } from 'react'
import { Ribbon } from './components/Ribbon'
import { LeftSidebar } from './components/LeftSidebar'
import { EditorPane } from './components/EditorPane'
import { RightSidebar } from './components/RightSidebar'
import { StatusBar } from './components/StatusBar'
import { LoginGate } from './components/LoginGate'
import { SettingsModal } from './components/SettingsModal'
import { useUiStore, MOBILE_BREAKPOINT } from './store/uiStore'
import { useAuthStore } from './store/authStore'
import { useVaultStore } from './store/vaultStore'

export function App() {
  const theme = useUiStore((s) => s.theme)
  const setMobile = useUiStore((s) => s.setMobile)

  // The breakpoint is watched rather than measured once, so rotating a phone
  // or dragging a desktop window narrow rearranges the shell as it happens.
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const sync = () => setMobile(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [setMobile])

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
  const mobile = useUiStore((s) => s.mobile)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightOpen = useUiStore((s) => s.rightOpen)
  const closePanels = useUiStore((s) => s.closePanels)
  const activeId = useVaultStore((s) => s.activeId)
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

  // On a phone the panels are drawers over the editor, so opening a note has
  // to put them away — otherwise the note you just picked is behind the list
  // you picked it from. Watching activeId covers every route to a note at
  // once: the file tree, search, tags, a backlink, the graph, and creation.
  useEffect(() => {
    if (mobile && activeId) closePanels()
  }, [mobile, activeId, closePanels])

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
      {mobile && (leftOpen || rightOpen) && (
        <button className="scrim" aria-label="Close panel" onClick={closePanels} />
      )}
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
