import { useEffect, useRef } from 'react'
import { useUiStore } from '../store/uiStore'
import { useVaultStore } from '../store/vaultStore'
import { dirname } from '../lib/paths'

/**
 * What a [[wikilink]] or graph node shows instead of guessing, when its title
 * names more than one note. Picking either the click or the panel it opened
 * over would be arbitrary in exactly the way pitchstone_notes_matching
 * refuses to be server-side — this is that refusal's UI.
 */
export function LinkChoice() {
  const choice = useUiStore((s) => s.linkChoice)
  const clear = useUiStore((s) => s.clearLinkChoice)
  const open = useVaultStore((s) => s.open)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!choice) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) clear()
    }
    window.addEventListener('keydown', onKey)
    // A capturing listener added after this click's own event has already
    // finished dispatching, so the click that opened the popover cannot
    // immediately close it again.
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [choice, clear])

  if (!choice) return null

  // Keep the popover on screen rather than run off the right or bottom edge
  // of the window at the click point.
  const width = 260
  const x = Math.min(choice.x, window.innerWidth - width - 12)
  const y = Math.min(choice.y, window.innerHeight - 12)

  return (
    <div
      ref={ref}
      className="link-choice"
      style={{ left: x, top: y }}
      role="menu"
      aria-label={`Which "${choice.target}"?`}
    >
      <div className="link-choice__heading">Which “{choice.target}”?</div>
      <ul className="link-choice__list">
        {choice.matches.map((note) => (
          <li key={note.id}>
            <button
              className="link-choice__item"
              role="menuitem"
              onClick={() => {
                void open(note.id)
                clear()
              }}
            >
              <span className="link-choice__title">{note.title}</span>
              <span className="link-choice__path">{dirname(note.path) || '/'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
