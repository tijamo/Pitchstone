import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUiStore } from '../store/uiStore'
import { useVaultStore } from '../store/vaultStore'
import { listLinks, type NoteMeta } from '../lib/notes'
import { findBrokenLinks, type BrokenLink, type LinkResolver, type LinkRow } from '../lib/linkCheck'
import { matchNotesByTarget, shortestUniqueSuffix } from '../lib/markdown/resolve'
import { dirname } from '../lib/paths'

/**
 * The whole vault's links, reviewed at once — every `[[link]]` that names no
 * note or more than one, with the corrections the vault itself suggests.
 *
 * A modal rather than a panel: this is a job with an end, not a way of
 * looking at the vault. Each fix rewrites one link in one note through the
 * ordinary save path, and the list is re-read afterwards, so what is on
 * screen is always the current state rather than a plan being worked through.
 */

const resolver: LinkResolver<NoteMeta> = {
  match: matchNotesByTarget,
  qualify: shortestUniqueSuffix,
}

export function LinkCheckModal() {
  const open = useUiStore((s) => s.linkCheckOpen)
  const close = useUiStore((s) => s.setLinkCheckOpen)
  const notes = useVaultStore((s) => s.notes)
  const openNote = useVaultStore((s) => s.open)
  const openOrCreate = useVaultStore((s) => s.openOrCreate)
  const retargetLink = useVaultStore((s) => s.retargetLink)

  const [rows, setRows] = useState<LinkRow[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The link being fixed right now, so its own row can say so. Every button
  // is disabled meanwhile: a second fix would be applied to a note the first
  // one is still rewriting.
  const [busy, setBusy] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      setRows(await listLinks())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the vault’s links.')
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    if (open) void scan()
  }, [open, scan])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const broken = useMemo(
    () => (rows ? findBrokenLinks(notes, rows, resolver) : []),
    [notes, rows],
  )

  // Grouped by the note the links are written in: fixing them is reading one
  // note at a time, not one link at a time.
  const byNote = useMemo(() => {
    const groups = new Map<string, { note: NoteMeta; links: BrokenLink<NoteMeta>[] }>()
    for (const link of broken) {
      const group = groups.get(link.source.id)
      if (group) group.links.push(link)
      else groups.set(link.source.id, { note: link.source, links: [link] })
    }
    return [...groups.values()]
  }, [broken])

  if (!open) return null

  const fix = async (link: BrokenLink<NoteMeta>, target: string) => {
    const key = `${link.source.id} ${link.target}`
    setBusy(key)
    const changed = await retargetLink(link.source.id, link.target, target)
    setBusy(null)
    if (changed) await scan()
  }

  // Writing the missing note is the other way to mend an unresolved link, and
  // the link then resolves on its own. It goes next to the note the link is
  // written in — following the link from that note would have done the same.
  const write = async (link: BrokenLink<NoteMeta>) => {
    close(false)
    await openOrCreate(link.target, link.source.id)
  }

  const unresolved = broken.filter((b) => b.kind === 'unresolved').length
  const ambiguous = broken.length - unresolved

  return (
    <div
      className="modal"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close(false)
      }}
    >
      <div className="modal__card" role="dialog" aria-modal="true" aria-label="Link check">
        <header className="modal__head">
          <h2 className="modal__title">Link check</h2>
          <button className="modal__close" aria-label="Close link check" onClick={() => close(false)}>
            ×
          </button>
        </header>

        <section className="modal__section">
          <div className="link-check__summary">
            <p className="modal__note">
              {rows === null
                ? 'Reading every link in the vault…'
                : broken.length === 0
                  ? 'Every link in the vault points at exactly one note.'
                  : [
                      unresolved > 0 &&
                        `${unresolved} link${unresolved === 1 ? '' : 's'} naming a note that does not exist`,
                      ambiguous > 0 &&
                        `${ambiguous} link${ambiguous === 1 ? '' : 's'} naming more than one note`,
                    ]
                      .filter(Boolean)
                      .join(', ') + '.'}
            </p>
            <button
              className="gate__ghost"
              disabled={scanning || busy !== null}
              onClick={() => void scan()}
            >
              {scanning ? 'Checking…' : 'Check again'}
            </button>
          </div>

          {error && <p className="gate__error">{error}</p>}

          {byNote.map(({ note, links }) => (
            <div key={note.id} className="link-check__group">
              <button
                className="link-check__source"
                title={note.path}
                onClick={() => {
                  close(false)
                  void openNote(note.id)
                }}
              >
                {dirname(note.path) && (
                  <span className="link-check__dir">{dirname(note.path)}/</span>
                )}
                {note.title}
              </button>

              {links.map((link) => {
                const key = `${link.source.id} ${link.target}`
                return (
                  <div key={key} className="link-check__issue">
                    <div className="link-check__what">
                      <code className={`link-check__target link-check__target--${link.kind}`}>
                        [[{link.target}]]
                      </code>
                      <span className="link-check__why">
                        {busy === key
                          ? 'rewriting the link…'
                          : link.kind === 'unresolved'
                            ? 'no note answers to this'
                            : 'more than one note answers to this'}
                      </span>
                    </div>

                    <div className="link-check__fixes">
                      {link.suggestions.map((suggestion) => (
                        <button
                          key={suggestion.note.id}
                          className="gate__ghost link-check__fix"
                          disabled={busy !== null}
                          title={`Point this link at ${suggestion.note.path}`}
                          onClick={() => void fix(link, suggestion.target)}
                        >
                          Use [[{suggestion.target}]]
                        </button>
                      ))}
                      {link.kind === 'unresolved' && (
                        <button
                          className="gate__ghost link-check__fix"
                          disabled={busy !== null}
                          title={`Write the note this link is asking for`}
                          onClick={() => void write(link)}
                        >
                          Write it
                        </button>
                      )}
                      {link.kind === 'unresolved' && link.suggestions.length === 0 && (
                        <span className="link-check__why">nothing in the vault is close</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
