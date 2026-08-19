import { Icon, type IconName } from './Icon'
import { useUiStore, type LeftTab } from '../store/uiStore'

const TABS: { tab: LeftTab; icon: IconName; label: string }[] = [
  { tab: 'files', icon: 'files', label: 'Files' },
  { tab: 'search', icon: 'search', label: 'Search' },
  { tab: 'tags', icon: 'tag', label: 'Tags' },
  { tab: 'graph', icon: 'graph', label: 'Graph view' },
]

export function Ribbon() {
  const leftTab = useUiStore((s) => s.leftTab)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const setLeftTab = useUiStore((s) => s.setLeftTab)
  const toggleTheme = useUiStore((s) => s.toggleTheme)

  return (
    <nav className="ribbon" aria-label="Primary">
      <button className="icon-button" title="New note" aria-label="New note">
        <Icon name="file-plus" />
      </button>

      <div style={{ height: 6 }} />

      {TABS.map(({ tab, icon, label }) => (
        <button
          key={tab}
          className={`icon-button${leftOpen && leftTab === tab ? ' icon-button--active' : ''}`}
          title={label}
          aria-label={label}
          aria-pressed={leftOpen && leftTab === tab}
          onClick={() => setLeftTab(tab)}
        >
          <Icon name={icon} />
        </button>
      ))}

      <div className="ribbon__spacer" />

      <button
        className="icon-button"
        title="Toggle theme"
        aria-label="Toggle theme"
        onClick={toggleTheme}
      >
        <Icon name="settings" />
      </button>
    </nav>
  )
}
