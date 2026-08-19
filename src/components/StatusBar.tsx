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

export function StatusBar() {
  const notes = useVaultStore((s) => s.notes)
  const content = useVaultStore((s) => s.content)
  const activeId = useVaultStore((s) => s.activeId)
  const saveStatus = useVaultStore((s) => s.saveStatus)

  const saveLabel = SAVE_LABEL[saveStatus]

  return (
    <footer className="statusbar">
      {saveLabel && (
        <span
          className={`statusbar__item${saveStatus === 'error' ? ' statusbar__item--error' : ''}`}
        >
          {saveLabel}
        </span>
      )}
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
