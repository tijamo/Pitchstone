import type { InlineContext, MarkdownConfig } from '@lezer/markdown'

const EXCLAMATION = 33
const OPEN_BRACKET = 91

/**
 * Teaches the markdown parser about `[[Target]]`, `[[Target|alias]]`, and the
 * `![[Embed]]` form.
 *
 * Doing this in the parser rather than with a regex over the text means
 * wikilinks are correctly ignored inside code spans and fenced blocks, and it
 * gives the live-preview decorations named nodes to hang off: the brackets and
 * pipe are `WikiLinkMark`, and the two halves are `WikiLinkTarget` and
 * `WikiLinkAlias`, so an aliased link can hide everything except its alias.
 */
export const wikiLinkSyntax: MarkdownConfig = {
  defineNodes: ['WikiLink', 'WikiLinkMark', 'WikiLinkTarget', 'WikiLinkAlias'],
  parseInline: [
    {
      name: 'WikiLink',
      // Ahead of the built-in Link and Image parsers, which would otherwise
      // claim the opening bracket.
      before: 'Link',
      parse(cx: InlineContext, next: number, pos: number) {
        const isEmbed = next === EXCLAMATION
        const open = isEmbed ? pos + 1 : pos
        if (cx.char(open) !== OPEN_BRACKET || cx.char(open + 1) !== OPEN_BRACKET) {
          return -1
        }

        const contentFrom = open + 2
        const rest = cx.slice(contentFrom, cx.end)
        // A wikilink never spans lines, so a missing `]]` on this line is not
        // a link rather than a link that swallows the rest of the note.
        const newline = rest.indexOf('\n')
        const searchable = newline === -1 ? rest : rest.slice(0, newline)
        const close = searchable.indexOf(']]')
        if (close === -1) return -1

        const text = searchable.slice(0, close)
        // A note name cannot contain a bracket, so `[[Broken and [[Real]]` is
        // one unterminated link followed by a real one — not a single link
        // with a nonsense target. lib/markdown/parse.ts applies the same rule.
        if (text.includes('[')) return -1
        if (text.trim() === '') return -1
        const contentTo = contentFrom + close
        const to = contentTo + 2
        const pipe = text.indexOf('|')

        const children = [cx.elt('WikiLinkMark', pos, contentFrom)]
        if (pipe === -1) {
          children.push(cx.elt('WikiLinkTarget', contentFrom, contentTo))
        } else {
          const pipeAt = contentFrom + pipe
          children.push(cx.elt('WikiLinkTarget', contentFrom, pipeAt))
          children.push(cx.elt('WikiLinkMark', pipeAt, pipeAt + 1))
          children.push(cx.elt('WikiLinkAlias', pipeAt + 1, contentTo))
        }
        children.push(cx.elt('WikiLinkMark', contentTo, to))

        return cx.addElement(cx.elt('WikiLink', pos, to, children))
      },
    },
  ],
}
