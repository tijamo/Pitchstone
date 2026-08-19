import { useUiStore, type RightTab } from '../store/uiStore'

const TABS: { tab: RightTab; label: string }[] = [
  { tab: 'backlinks', label: 'Backlinks' },
  { tab: 'outline', label: 'Outline' },
]

const EMPTY: Record<RightTab, { title: string; hint: string }> = {
  backlinks: {
    title: 'No backlinks',
    hint: 'Notes that link here with [[wikilinks]] will be listed with their surrounding context.',
  },
  outline: {
    title: 'No headings',
    hint: 'Headings in the open note become a jumpable outline.',
  },
}

export function RightSidebar() {
  const rightTab = useUiStore((s) => s.rightTab)
  const rightOpen = useUiStore((s) => s.rightOpen)
  const setRightTab = useUiStore((s) => s.setRightTab)
  const empty = EMPTY[rightTab]

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
        <div className="empty empty--pane">
          <span className="empty__title">{empty.title}</span>
          <span className="empty__hint">{empty.hint}</span>
        </div>
      </div>
    </aside>
  )
}
