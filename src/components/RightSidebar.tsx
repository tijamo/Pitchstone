import { useMemo } from 'react'
import { useUiStore, type RightTab } from '../store/uiStore'
import { useVaultStore } from '../store/vaultStore'
import { extractHeadings } from '../lib/markdown/parse'
import { revealLine } from './editor/editorHandle'

const TABS: { tab: RightTab; label: string }[] = [
  { tab: 'backlinks', label: 'Backlinks' },
  { tab: 'outline', label: 'Outline' },
]

export function RightSidebar() {
  const rightTab = useUiStore((s) => s.rightTab)
  const rightOpen = useUiStore((s) => s.rightOpen)
  const setRightTab = useUiStore((s) => s.setRightTab)

  const content = useVaultStore((s) => s.content)
  const activeId = useVaultStore((s) => s.activeId)
  const headings = useMemo(() => extractHeadings(content), [content])

  return (
    <aside
      className={`sidebar sidebar--right${rightOpen ? '' : ' sidebar--collapsed'}`}
      aria-hidden={!rightOpen}
    >
      <div className="sidebar__tabs" role="tablist">
        {TABS.map(({ tab, label }) => (
          <button
            key={tab}
            role="tab"
            aria-selected={rightTab === tab}
            className={`sidebar__tab${rightTab === tab ? ' sidebar__tab--active' : ''}`}
            onClick={() => setRightTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="sidebar__body">
        {rightTab === 'backlinks' ? (
          <div className="empty empty--pane">
            <span className="empty__title">No backlinks</span>
            <span className="empty__hint">
              Notes that link here with [[wikilinks]] will be listed with their
              surrounding context.
            </span>
          </div>
        ) : !activeId ? (
          <div className="empty empty--pane">
            <span className="empty__title">Nothing open</span>
            <span className="empty__hint">
              Open a note and its headings appear here as a jumpable outline.
            </span>
          </div>
        ) : headings.length === 0 ? (
          <div className="empty empty--pane">
            <span className="empty__title">No headings</span>
            <span className="empty__hint">
              Start a line with <code>#</code> to add one.
            </span>
          </div>
        ) : (
          <ul className="outline">
            {headings.map((heading, index) => (
              <li key={`${heading.line}-${index}`}>
                <button
                  className="outline__item"
                  style={{ paddingLeft: 6 + (heading.level - 1) * 12 }}
                  title={heading.text}
                  onClick={() => revealLine(heading.line)}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
