import { useVaultStore, type SaveStatus } from '../store/vaultStore'

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
}

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g)
  return matches ? matches.length : 0
}

/**
 * Whether the open note is saved. Its home is the status bar, but the status
 * bar is one of the things a phone screen cannot afford — so on mobile the
 * editor header borrows this rather than leaving the question unanswered.
 */
export function SaveIndicator() {
  const saveStatus = useVaultStore((s) => s.saveStatus)
  const saveLabel = SAVE_LABEL[saveStatus]
  if (!saveLabel) return null

  return (
    <span className={`statusbar__item${saveStatus === 'error' ? ' statusbar__item--error' : ''}`}>
      {saveLabel}
    </span>
  )
}

export function StatusBar() {
  const notes = useVaultStore((s) => s.notes)
  const content = useVaultStore((s) => s.content)
  const activeId = useVaultStore((s) => s.activeId)

  return (
    <footer className="statusbar">
      <SaveIndicator />
      <span className="statusbar__item">
        {notes.length} {notes.length === 1 ? 'note' : 'notes'}
      </span>
      {activeId && (
        <span className="statusbar__item">
          {countWords(content)} {countWords(content) === 1 ? 'word' : 'words'}
        </span>
      )}
      <span className="statusbar__item statusbar__version" title="Pitchstone version">
        v{__APP_VERSION__}
      </span>
    </footer>
  )
}
