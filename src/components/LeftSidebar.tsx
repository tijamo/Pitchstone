import { fittedWidth, useUiStore, type LeftTab } from '../store/uiStore'
import { useVaultStore } from '../store/vaultStore'
import { FileTree } from './FileTree'
import { SearchPanel } from './SearchPanel'
import { TagsPanel } from './TagsPanel'
import { GraphView } from './GraphView'
import { Resizer } from './Resizer'
import { Icon } from './Icon'

const TABS: { tab: LeftTab; label: string }[] = [
  { tab: 'files', label: 'Files' },
  { tab: 'search', label: 'Search' },
  { tab: 'tags', label: 'Tags' },
  { tab: 'graph', label: 'Graph' },
]

export function LeftSidebar() {
  const leftTab = useUiStore((s) => s.leftTab)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const leftWidth = useUiStore((s) => s.leftWidth)
  const mobile = useUiStore((s) => s.mobile)
  const viewport = useUiStore((s) => s.viewport)
  const rightReserved = useUiStore((s) => (s.rightOpen ? s.rightWidth : 0))
  const setLeftTab = useUiStore((s) => s.setLeftTab)
  const setLinkCheckOpen = useUiStore((s) => s.setLinkCheckOpen)

  const notes = useVaultStore((s) => s.notes)
  const loading = useVaultStore((s) => s.loading)
  const create = useVaultStore((s) => s.create)

  // A drawer's width is CSS's on mobile — it is not resizable there, and an
  // inline width would win over the stylesheet. On a desktop the panel renders
  // at what it was dragged to, held to what this window can currently show.
  const width = mobile
    ? undefined
    : { width: leftOpen ? fittedWidth(leftWidth, rightReserved, viewport) : 0 }

  return (
    <aside
      className={`sidebar sidebar--left${leftOpen ? '' : ' sidebar--collapsed'}${
        leftTab === 'graph' ? ' sidebar--graph' : ''
      }`}
      style={width}
      aria-hidden={!leftOpen}
    >
      <div className="sidebar__tabs" role="tablist">
        {TABS.map(({ tab, label }) => (
          <button
            key={tab}
            role="tab"
            aria-selected={leftTab === tab}
            className={`sidebar__tab${leftTab === tab ? ' sidebar__tab--active' : ''}`}
            onClick={() => setLeftTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {leftTab === 'graph' ? (
        <div className="sidebar__body sidebar__body--flush">
          <GraphView />
        </div>
      ) : leftTab === 'files' ? (
        <>
          <div className="sidebar__header">
            <span className="sidebar__header-label">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </span>
            <span className="sidebar__header-actions">
              <button
                className="tree__action"
                title="Check links"
                aria-label="Check links"
                onClick={() => setLinkCheckOpen(true)}
              >
                <Icon name="link-broken" size={14} />
              </button>
              <button
                className="tree__action"
                title="New note"
                aria-label="New note"
                onClick={() => void create()}
              >
                <Icon name="file-plus" size={14} />
              </button>
            </span>
          </div>

          <div className="sidebar__body">
            {loading ? (
              <div className="empty empty--pane">
                <span className="empty__title">Loading your vault…</span>
              </div>
            ) : notes.length === 0 ? (
              <div className="empty empty--pane">
                <span className="empty__title">No notes yet</span>
                <span className="empty__hint">
                  Create your first note with the + button above. Type a name
                  with slashes — like <code>Projects/Ideas</code> — to put it in
                  a folder.
                </span>
              </div>
            ) : (
              <FileTree />
            )}
          </div>
        </>
      ) : leftTab === 'search' ? (
        <SearchPanel />
      ) : (
        <div className="sidebar__body">
          <TagsPanel />
        </div>
      )}

      {leftOpen && !mobile && <Resizer side="left" />}
    </aside>
  )
}
