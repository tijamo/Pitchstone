import { useUiStore, type LeftTab } from '../store/uiStore'
import { useVaultStore } from '../store/vaultStore'
import { FileTree } from './FileTree'
import { Icon } from './Icon'

const TABS: { tab: LeftTab; label: string }[] = [
  { tab: 'files', label: 'Files' },
  { tab: 'search', label: 'Search' },
  { tab: 'tags', label: 'Tags' },
  { tab: 'graph', label: 'Graph' },
]

const EMPTY: Record<Exclude<LeftTab, 'files'>, { title: string; hint: string }> = {
  search: {
    title: 'Search your vault',
    hint: 'Full-text search across every note, with matching excerpts.',
  },
  tags: {
    title: 'No tags yet',
    hint: 'Tags written as #tag, or listed in a note’s frontmatter, are collected here.',
  },
  graph: {
    title: 'Nothing to plot',
    hint: 'Once notes link to each other, the graph shows how they connect.',
  },
}

export function LeftSidebar() {
  const leftTab = useUiStore((s) => s.leftTab)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const setLeftTab = useUiStore((s) => s.setLeftTab)

  const notes = useVaultStore((s) => s.notes)
  const loading = useVaultStore((s) => s.loading)
  const create = useVaultStore((s) => s.create)

  return (
    <aside
      className={`sidebar sidebar--left${leftOpen ? '' : ' sidebar--collapsed'}`}
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

      {leftTab === 'files' ? (
        <>
          <div className="sidebar__header">
            <span className="sidebar__header-label">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </span>
            <button
              className="tree__action"
              title="New note"
              aria-label="New note"
              onClick={() => void create('')}
            >
              <Icon name="file-plus" size={14} />
            </button>
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
      ) : (
        <div className="sidebar__body">
          <div className="empty empty--pane">
            <span className="empty__title">{EMPTY[leftTab].title}</span>
            <span className="empty__hint">{EMPTY[leftTab].hint}</span>
          </div>
        </div>
      )}
    </aside>
  )
}
