import { Icon } from './Icon'
import { useUiStore } from '../store/uiStore'

export function EditorPane() {
  const toggleLeft = useUiStore((s) => s.toggleLeft)
  const toggleRight = useUiStore((s) => s.toggleRight)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightOpen = useUiStore((s) => s.rightOpen)

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

        <span className="tabbar__title" style={{ flex: 1, marginLeft: 8 }}>
          No note open
        </span>

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
        <div className="empty">
          <span className="empty__title">Nothing open</span>
          <span className="empty__hint">
            Create a note to start writing. Link notes together with
            [[wikilinks]] and they will show up in backlinks and the graph.
          </span>
        </div>
      </div>
    </main>
  )
}
