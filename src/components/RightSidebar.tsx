import { useEffect, useMemo, useState } from 'react'
import { useUiStore, type RightTab } from '../store/uiStore'
import { useVaultStore } from '../store/vaultStore'
import { extractHeadings } from '../lib/markdown/parse'
import { fetchBacklinks, type Backlink } from '../lib/notes'
import { revealLine } from './editor/editorHandle'
import { GraphView } from './GraphView'
import { Resizer } from './Resizer'

const TABS: { tab: RightTab; label: string }[] = [
  { tab: 'backlinks', label: 'Backlinks' },
  { tab: 'outline', label: 'Outline' },
  { tab: 'graph', label: 'Graph' },
]

export function RightSidebar() {
  const rightTab = useUiStore((s) => s.rightTab)
  const rightOpen = useUiStore((s) => s.rightOpen)
  const rightWidth = useUiStore((s) => s.rightWidth)
  const setRightTab = useUiStore((s) => s.setRightTab)

  const content = useVaultStore((s) => s.content)
  const activeId = useVaultStore((s) => s.activeId)
  const saveStatus = useVaultStore((s) => s.saveStatus)
  const notes = useVaultStore((s) => s.notes)
  const open = useVaultStore((s) => s.open)
  const headings = useMemo(() => extractHeadings(content), [content])
  const activeTitle = notes.find((n) => n.id === activeId)?.title ?? ''

  const [backlinks, setBacklinks] = useState<Backlink[]>([])
  const [loadingBacklinks, setLoadingBacklinks] = useState(false)

  // Refetched whenever the open note changes, and whenever a save lands
  // (a link could have been added, removed, or newly resolved).
  useEffect(() => {
    if (rightTab !== 'backlinks' || !activeId) {
      setBacklinks([])
      return
    }
    let cancelled = false
    setLoadingBacklinks(true)
    fetchBacklinks(activeId, activeTitle)
      .then((result) => {
        if (!cancelled) setBacklinks(result)
      })
      .catch(() => {
        if (!cancelled) setBacklinks([])
      })
      .finally(() => {
        if (!cancelled) setLoadingBacklinks(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab, activeId, activeTitle, saveStatus === 'saved'])

  return (
    <aside
      className={`sidebar sidebar--right${rightOpen ? '' : ' sidebar--collapsed'}`}
      style={{ width: rightOpen ? rightWidth : 0 }}
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

      {rightTab === 'graph' ? (
        <div className="sidebar__body sidebar__body--flush">
          <GraphView />
        </div>
      ) : (
        <div className="sidebar__body">
          {rightTab === 'backlinks' ? (
            !activeId ? (
              <div className="empty empty--pane">
                <span className="empty__title">Nothing open</span>
                <span className="empty__hint">
                  Open a note to see which others link to it.
                </span>
              </div>
            ) : loadingBacklinks ? (
              <div className="empty empty--pane">
                <span className="empty__title">Loading…</span>
              </div>
            ) : backlinks.length === 0 ? (
              <div className="empty empty--pane">
                <span className="empty__title">No backlinks</span>
                <span className="empty__hint">
                  Notes that link here with [[wikilinks]] will be listed with
                  their surrounding context.
                </span>
              </div>
            ) : (
              <ul className="backlinks">
                {backlinks.map(({ note, snippet }) => (
                  <li key={note.id}>
                    <button
                      className="backlinks__item"
                      title={note.path}
                      onClick={() => void open(note.id)}
                    >
                      <span className="backlinks__title">{note.title}</span>
                      {snippet && <span className="backlinks__snippet">{snippet}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )
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
      )}

      {rightOpen && <Resizer side="right" />}
    </aside>
  )
}
