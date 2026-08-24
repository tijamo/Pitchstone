import { useEffect } from 'react'
import { useUiStore } from '../store/uiStore'
import { changelog } from '../changelog'

/**
 * The version number is otherwise just a string — this is what tapping it is
 * for. Every entry in changelog.ts, newest first, the same data the status
 * bar and Settings' About section read their own version from.
 */
export function ChangelogModal() {
  const open = useUiStore((s) => s.changelogOpen)
  const close = useUiStore((s) => s.setChangelogOpen)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <div
      className="modal"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close(false)
      }}
    >
      <div className="modal__card" role="dialog" aria-modal="true" aria-label="Release notes">
        <header className="modal__head">
          <h2 className="modal__title">Release notes</h2>
          <button
            className="modal__close"
            aria-label="Close release notes"
            onClick={() => close(false)}
          >
            ×
          </button>
        </header>

        {changelog.map((entry) => (
          <section className="modal__section changelog__entry" key={entry.ver}>
            <h3 className="changelog__version">
              v{entry.ver} — {entry.title}
            </h3>
            <ul className="changelog__list">
              {entry.items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
