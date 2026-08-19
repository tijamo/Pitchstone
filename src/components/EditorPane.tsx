import { useEffect, useRef } from 'react'
import { Icon } from './Icon'
import { useUiStore } from '../store/uiStore'
import { useVaultStore } from '../store/vaultStore'

/**
 * A plain textarea for now. CodeMirror 6 replaces it in Phase 2 — keeping the
 * editor dumb here means the vault store, autosave, and explorer can all be
 * exercised end to end first.
 */
export function EditorPane() {
  const toggleLeft = useUiStore((s) => s.toggleLeft)
  const toggleRight = useUiStore((s) => s.toggleRight)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightOpen = useUiStore((s) => s.rightOpen)

  const notes = useVaultStore((s) => s.notes)
  const activeId = useVaultStore((s) => s.activeId)
  const content = useVaultStore((s) => s.content)
  const edit = useVaultStore((s) => s.edit)
  const create = useVaultStore((s) => s.create)
  const renamingId = useVaultStore((s) => s.renamingId)

  const active = notes.find((n) => n.id === activeId) ?? null
  const textarea = useRef<HTMLTextAreaElement>(null)

  // A freshly created note is opened *and* dropped into rename mode at once, so
  // focusing the editor here would blur the rename box out from under the user.
  useEffect(() => {
    if (activeId && !renamingId) textarea.current?.focus()
  }, [activeId, renamingId])

  return (
    <main className="main">
      <div className="tabbar">
        <button
          className="icon-button"
          title={leftOpen ? 'Hide left sidebar' : 'Show left sidebar'}
          aria-label={leftOpen ? 'Hide left sidebar' : 'Show left sidebar'}
          onClick={toggleLeft}
        >
          <Icon name="panel-left" size={15} />
        </button>

        <span className="tabbar__title">{active ? active.path : 'No note open'}</span>

        <button
          className="icon-button"
          title={rightOpen ? 'Hide right sidebar' : 'Show right sidebar'}
          aria-label={rightOpen ? 'Hide right sidebar' : 'Show right sidebar'}
          onClick={toggleRight}
        >
          <Icon name="panel-right" size={15} />
        </button>
      </div>

      <div className="editor">
        {active ? (
          <div className="editor__inner">
            <textarea
              ref={textarea}
              className="editor__textarea"
              value={content}
              spellCheck
              placeholder="Start writing…"
              aria-label={`Contents of ${active.title}`}
              onChange={(e) => edit(e.target.value)}
            />
          </div>
        ) : (
          <div className="empty">
            <span className="empty__title">Nothing open</span>
            <span className="empty__hint">
              Pick a note from the sidebar, or create one to start writing.
            </span>
            <button className="empty__button" onClick={() => void create('')}>
              New note
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
