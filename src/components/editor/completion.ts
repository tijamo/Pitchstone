import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'

/**
 * Typing `[[` offers the vault's note titles. Accepting one closes the brackets
 * unless the text already has them — which is the case when completing inside a
 * link that was typed the other way round.
 */
export function wikilinkCompletions(getTitles: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/\[\[[^\]\n|]*/)
    if (!before) return null

    const titles = getTitles()
    if (titles.length === 0) return null

    const options: Completion[] = titles.map((title) => ({
      label: title,
      type: 'text',
      apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
        const closing = view.state.sliceDoc(to, to + 2) === ']]' ? '' : ']]'
        const insert = title + closing
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
        })
      },
    }))

    return {
      from: before.from + 2,
      options,
      validFor: /^[^\]\n|]*$/,
    }
  }
}
