import { useMemo, useState } from 'react'
import { useVaultStore } from '../store/vaultStore'

export function TagsPanel() {
  const notes = useVaultStore((s) => s.notes)
  const open = useVaultStore((s) => s.open)
  const [selected, setSelected] = useState<string | null>(null)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const note of notes) {
      for (const tag of note.tags) map.set(tag, (map.get(tag) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [notes])

  if (counts.length === 0) {
    return (
      <div className="empty empty--pane">
        <span className="empty__title">No tags yet</span>
        <span className="empty__hint">
          Tags written as #tag, or listed in a note’s frontmatter, are collected
          here.
        </span>
      </div>
    )
  }

  if (selected && counts.some(([tag]) => tag === selected)) {
    const tagged = notes.filter((n) => n.tags.includes(selected))
    return (
      <div>
        <button className="tags-panel__back" onClick={() => setSelected(null)}>
          ‹ All tags
        </button>
        <div className="tags-panel__heading">#{selected}</div>
        <ul className="tree">
          {tagged.map((note) => (
            <li key={note.id}>
              <div className="tree__row">
                <button
                  className="tree__label"
                  title={note.path}
                  onClick={() => void open(note.id)}
                >
                  <span className="tree__name">{note.title}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <ul className="tags-panel__list">
      {counts.map(([tag, count]) => (
        <li key={tag}>
          <button
            className="tags-panel__tag"
            title={`#${tag}`}
            onClick={() => setSelected(tag)}
          >
            <span className="tags-panel__name">#{tag}</span>
            <span className="tags-panel__count">{count}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
