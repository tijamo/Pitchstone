import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

/**
 * Every colour and size here comes from the tokens in styles/theme.css, so the
 * editor follows the app's light and dark themes without a second palette.
 */
export const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--text-normal)',
    backgroundColor: 'transparent',
    fontFamily: 'var(--font-text)',
    fontSize: 'var(--font-size-text)',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.6',
    padding: '0',
  },
  '.cm-content': {
    padding: '0',
    caretColor: 'var(--accent)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--accent-soft)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },

  // Headings. Sizes step down toward body text, as in Obsidian.
  '.cm-md-h1': { fontSize: '1.75em', fontWeight: '650', lineHeight: '1.3' },
  '.cm-md-h2': { fontSize: '1.45em', fontWeight: '650', lineHeight: '1.35' },
  '.cm-md-h3': { fontSize: '1.22em', fontWeight: '600', lineHeight: '1.4' },
  '.cm-md-h4': { fontSize: '1.08em', fontWeight: '600' },
  '.cm-md-h5': { fontSize: '1em', fontWeight: '600' },
  '.cm-md-h6': { fontSize: '1em', fontWeight: '600', color: 'var(--text-muted)' },

  '.cm-md-code': {
    padding: '0.1em 0.3em',
    borderRadius: '3px',
    backgroundColor: 'var(--bg-raised)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
  },

  // Wikilinks render as clickable text; unresolved ones are visibly different
  // so a typo, or a note not yet created, reads as such at a glance.
  '.cm-wikilink': {
    color: 'var(--link)',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  // The line, not the shorthand: `textDecoration: 'underline'` would reset
  // the dashed/dotted style the two states below set, so hovering an
  // unresolved link would quietly turn it into a resolved-looking one.
  '.cm-wikilink:hover': { textDecorationLine: 'underline' },
  '.cm-wikilink--unresolved': {
    color: 'var(--link-unresolved)',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dashed',
    textUnderlineOffset: '3px',
  },
  // More than one note answers to this title — distinct from unresolved
  // (dashed) because the fix is to qualify the link, not to write a note.
  '.cm-wikilink--ambiguous': {
    color: 'var(--link-ambiguous)',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: '3px',
  },

  '.cm-tooltip': {
    backgroundColor: 'var(--bg-raised)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 6px 20px rgb(0 0 0 / 0.28)',
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--font-size-ui)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '4px 10px',
    color: 'var(--text-muted)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--text-normal)',
  },
  // The folder hint beside a completion whose title is not unique.
  '.cm-completionDetail': {
    marginLeft: '8px',
    color: 'var(--text-faint)',
    fontStyle: 'normal',
  },
})

export const markdownHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.strong, fontWeight: '650' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: tags.link, color: 'var(--link)' },
    { tag: tags.url, color: 'var(--text-faint)' },
    { tag: tags.quote, color: 'var(--text-muted)', fontStyle: 'italic' },
    { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
    { tag: tags.list, color: 'var(--text-muted)' },
    { tag: tags.processingInstruction, color: 'var(--text-faint)' },
    { tag: tags.contentSeparator, color: 'var(--text-faint)' },
    { tag: tags.comment, color: 'var(--text-faint)' },
  ]),
)
