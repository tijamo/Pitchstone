import { Suspense, lazy, useEffect } from 'react'
import { Icon } from './Icon'
import { useUiStore } from '../store/uiStore'
import { useVaultStore } from '../store/vaultStore'

// CodeMirror's markdown mode pulls in the HTML, JavaScript, and CSS modes for
// embedded code, which together are larger than the rest of the app. Splitting
// it out keeps the shell light; the effect below fetches the chunk as soon as
// the app is up, so it is already there by the time a note is opened.
const Editor = lazy(() => import('./editor/Editor'))

export function EditorPane() {
  const toggleLeft = useUiStore((s) => s.toggleLeft)
  const toggleRight = useUiStore((s) => s.toggleRight)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightOpen = useUiStore((s) => s.rightOpen)

  const notes = useVaultStore((s) => s.notes)
  const activeId = useVaultStore((s) => s.activeId)
  const create = useVaultStore((s) => s.create)

  const active = notes.find((n) => n.id === activeId) ?? null

  useEffect(() => {
    void import('./editor/Editor')
  }, [])

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
            <Suspense fallback={null}>
              <Editor />
            </Suspense>
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
