import { useUiStore, type LeftTab } from '../store/uiStore'

const TABS: { tab: LeftTab; label: string }[] = [
  { tab: 'files', label: 'Files' },
  { tab: 'search', label: 'Search' },
  { tab: 'tags', label: 'Tags' },
  { tab: 'graph', label: 'Graph' },
]

const EMPTY: Record<LeftTab, { title: string; hint: string }> = {
  files: {
    title: 'No notes yet',
    hint: 'Your vault is empty. Notes you create will appear here as a folder tree.',
  },
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
  const empty = EMPTY[leftTab]

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

      <div className="sidebar__body">
        <div className="empty empty--pane">
          <span className="empty__title">{empty.title}</span>
          <span className="empty__hint">{empty.hint}</span>
        </div>
      </div>
    </aside>
  )
}
