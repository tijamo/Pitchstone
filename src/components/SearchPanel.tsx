import { useEffect, useMemo, useRef, useState } from 'react'
import { useVaultStore } from '../store/vaultStore'
import { searchNotes, type SearchResult } from '../lib/notes'
import { duplicateTitles } from '../lib/markdown/resolve'
import { dirname } from '../lib/paths'

/** Matches the StartSel/StopSel delimiters pitchstone_search_notes wraps hits
 * in — plain control characters, not HTML, so highlights render as React text
 * rather than trusting raw note content inside dangerouslySetInnerHTML. */
const START = '\u0001'
const STOP = '\u0002'
const DELIM = new RegExp(`[${START}${STOP}]`)

export function SearchPanel() {
  const open = useVaultStore((s) => s.open)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const duplicates = useMemo(() => duplicateTitles(results), [results])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      setError(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      searchNotes(q)
        .then((r) => {
          setResults(r)
          setError(false)
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <>
      <div className="sidebar__header">
        <input
          className="search-panel__input"
          type="text"
          placeholder="Search your vault…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="sidebar__body">
        {!query.trim() ? (
          <div className="empty empty--pane">
            <span className="empty__title">Search your vault</span>
            <span className="empty__hint">
              Full-text search across every note, with matching excerpts.
            </span>
          </div>
        ) : loading ? (
          <div className="empty empty--pane">
            <span className="empty__title">Searching…</span>
          </div>
        ) : error ? (
          <div className="empty empty--pane">
            <span className="empty__title">Search failed</span>
          </div>
        ) : results.length === 0 ? (
          <div className="empty empty--pane">
            <span className="empty__title">No matches</span>
          </div>
        ) : (
          <ul className="tree">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  className="search-panel__result"
                  title={result.path}
                  onClick={() => void open(result.id)}
                >
                  <span className="tree__name">{result.title}</span>
                  {duplicates.has(result.title.toLowerCase()) && (
                    <span className="item-path">{dirname(result.path) || '/'}</span>
                  )}
                  <span className="search-panel__snippet">
                    {highlight(result.snippet)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function highlight(snippet: string) {
  // ts_headline always wraps each hit in a Start/Stop pair, so splitting on
  // either delimiter alternates plain text and matched terms.
  return snippet
    .split(DELIM)
    .map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))
}
