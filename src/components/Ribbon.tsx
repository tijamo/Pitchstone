import { Icon, type IconName } from './Icon'
import { useUiStore, type LeftTab } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useVaultStore } from '../store/vaultStore'

const TABS: { tab: LeftTab; icon: IconName; label: string }[] = [
  { tab: 'files', icon: 'files', label: 'Files' },
  { tab: 'search', icon: 'search', label: 'Search' },
  { tab: 'tags', icon: 'tag', label: 'Tags' },
]

export function Ribbon() {
  const leftTab = useUiStore((s) => s.leftTab)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightTab = useUiStore((s) => s.rightTab)
  const rightOpen = useUiStore((s) => s.rightOpen)
  const setLeftTab = useUiStore((s) => s.setLeftTab)
  const setRightTab = useUiStore((s) => s.setRightTab)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const setHelpOpen = useUiStore((s) => s.setHelpOpen)
  const mobile = useUiStore((s) => s.mobile)
  const toggleLeft = useUiStore((s) => s.toggleLeft)
  const toggleRight = useUiStore((s) => s.toggleRight)
  const create = useVaultStore((s) => s.create)
  const signOut = useAuthStore((s) => s.signOut)

  const graphOpen = rightOpen && rightTab === 'graph'

  // On a phone a panel covers the screen, so the button that opened it is the
  // obvious thing to press to put it away again. On a desktop the panel sits
  // beside the editor and hiding it is the tabbar's job, so tapping a tab
  // there keeps meaning "show me this".
  const showLeft = (tab: LeftTab) => {
    if (mobile && leftOpen && leftTab === tab) toggleLeft()
    else setLeftTab(tab)
  }

  return (
    <nav className="ribbon" aria-label="Primary">
      <button
        className="icon-button"
        title="New note"
        aria-label="New note"
        onClick={() => void create()}
      >
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
          onClick={() => showLeft(tab)}
        >
          <Icon name={icon} />
        </button>
      ))}

      {/* The graph lives in the right panel, so its ribbon button reaches
          across to that side rather than switching the left one. */}
      <button
        className={`icon-button${graphOpen ? ' icon-button--active' : ''}`}
        title="Graph view"
        aria-label="Graph view"
        aria-pressed={graphOpen}
        onClick={() => (mobile && graphOpen ? toggleRight() : setRightTab('graph'))}
      >
        <Icon name="graph" />
      </button>

      <div className="ribbon__spacer" />

      <button
        className="icon-button"
        title="Help"
        aria-label="Help"
        onClick={() => setHelpOpen(true)}
      >
        <Icon name="help" />
      </button>

      <button
        className="icon-button"
        title="Settings"
        aria-label="Settings"
        onClick={() => setSettingsOpen(true)}
      >
        <Icon name="settings" />
      </button>

      <button
        className="icon-button"
        title="Sign out"
        aria-label="Sign out"
        onClick={() => void signOut()}
      >
        <Icon name="log-out" />
      </button>
    </nav>
  )
}
