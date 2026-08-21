import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { dirname } from '../../lib/paths'
import { duplicateTitles, shortestUniqueSuffix, type NoteRef } from '../../lib/markdown/resolve'

/**
 * Typing `[[` offers the vault's note titles. Accepting one closes the brackets
 * unless the text already has them — which is the case when completing inside a
 * link that was typed the other way round.
 *
 * A title shared by more than one note gets a folder hint beside it in the
 * list — the only visible difference from a unique one — and accepting it
 * inserts the shortest folder-qualified form that picks out just that note,
 * rather than a bare title the vault can no longer resolve on its own.
 */
export function wikilinkCompletions(getNotes: () => NoteRef[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/\[\[[^\]\n|]*/)
    if (!before) return null

    const notes = [...getNotes()].sort(
      (a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path),
    )
    if (notes.length === 0) return null

    const duplicates = duplicateTitles(notes)

    const options: Completion[] = notes.map((note) => {
      const ambiguous = duplicates.has(note.title.toLowerCase())
      const insertAs = ambiguous ? shortestUniqueSuffix(notes, note) : note.title

      return {
        label: note.title,
        detail: ambiguous ? dirname(note.path) || '/' : undefined,
        type: 'text',
        apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
          const closing = view.state.sliceDoc(to, to + 2) === ']]' ? '' : ']]'
          const insert = insertAs + closing
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + insert.length },
          })
        },
      }
    })

    return {
      from: before.from + 2,
      options,
      validFor: /^[^\]\n|]*$/,
    }
  }
}
