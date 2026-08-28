import { syntaxTree } from '@codemirror/language'
import { StateEffect, StateField, type Range } from '@codemirror/state'
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view'
import { matchNotesByTarget, type NoteRef } from '../../lib/markdown/resolve'

/**
 * Obsidian-style live preview.
 *
 * Markdown stays markdown — the document is never rewritten — but the syntax
 * that carries formatting is hidden and the text is styled instead. The moment
 * the cursor enters a line, that line's raw syntax reappears, so the text under
 * the caret is always exactly what is stored.
 */

/** The vault's notes, so a link can be shown as resolved, unresolved, or ambiguous. */
export const setVaultIndex = StateEffect.define<NoteRef[]>()

export const vaultIndex = StateField.define<NoteRef[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setVaultIndex)) return effect.value
    }
    return value
  },
})

const hidden = Decoration.replace({})

const HEADING = /^ATXHeading(\d)$/

/** Lines the selection touches, whose syntax must stay visible. */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>()
  for (const range of view.state.selection.ranges) {
    const from = view.state.doc.lineAt(range.from).number
    const to = view.state.doc.lineAt(range.to).number
    for (let line = from; line <= to; line++) lines.add(line)
  }
  return lines
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const active = activeLines(view)
  const doc = view.state.doc
  const notes = view.state.field(vaultIndex, false) ?? []

  /** True when this position sits on a line the cursor is on. */
  const revealed = (pos: number) => active.has(doc.lineAt(pos).number)

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const heading = HEADING.exec(node.name)
        if (heading) {
          ranges.push(
            Decoration.line({ class: `cm-md-h${heading[1]}` }).range(
              doc.lineAt(node.from).from,
            ),
          )
          return
        }

        switch (node.name) {
          case 'HeaderMark': {
            if (revealed(node.from)) return
            // Swallow the space after the hashes too, so the heading text is
            // flush left rather than indented by the hidden syntax.
            const end =
              doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
            ranges.push(hidden.range(node.from, end))
            return
          }

          case 'EmphasisMark':
          case 'CodeMark':
            if (!revealed(node.from)) ranges.push(hidden.range(node.from, node.to))
            return

          case 'InlineCode':
            ranges.push(Decoration.mark({ class: 'cm-md-code' }).range(node.from, node.to))
            return

          case 'WikiLink': {
            const target = targetOf(view, node.from, node.to)
            const matches = matchNotesByTarget(notes, target)
            const state = matches.length === 0 ? 'unresolved' : matches.length > 1 ? 'ambiguous' : ''
            ranges.push(
              Decoration.mark({
                class: `cm-wikilink${state ? ` cm-wikilink--${state}` : ''}`,
                attributes: { 'data-wikilink': target },
              }).range(node.from, node.to),
            )
            return
          }

          case 'WikiLinkMark':
            if (!revealed(node.from)) ranges.push(hidden.range(node.from, node.to))
            return

          case 'WikiLinkTarget': {
            const parent = node.node.parent
            const hasAlias =
              parent?.name === 'WikiLink' &&
              parent.getChild('WikiLinkAlias') !== null

            if (revealed(node.from)) return

            if (hasAlias) {
              // With an alias present, the target itself is syntax: hide it
              // and let the alias stand in, exactly as Obsidian renders it.
              ranges.push(hidden.range(node.from, node.to))
              return
            }

            // A folder-qualified target with no alias ("Pitchstone/gotchas")
            // shows only its leaf segment, the same way Obsidian hides a
            // folder path it did not ask to see — the qualifier is there to
            // pick a note, not to be read.
            const text = doc.sliceString(node.from, node.to)
            const lastSlash = text.lastIndexOf('/')
            if (lastSlash !== -1) {
              ranges.push(hidden.range(node.from, node.from + lastSlash + 1))
            }
            return
          }
        }
      },
    })
  }

  return Decoration.set(ranges, true)
}

/** The link's target title, taken from the `WikiLinkTarget` child. */
function targetOf(view: EditorView, from: number, to: number): string {
  const node = syntaxTree(view.state).resolveInner(from + 1, 1)
  const link = node.name === 'WikiLink' ? node : node.parent
  const target = link?.getChild('WikiLinkTarget')
  return target
    ? view.state.doc.sliceString(target.from, target.to).trim()
    : view.state.doc.sliceString(from, to).replace(/^!?\[\[|\]\]$/g, '').trim()
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      // Selection changes matter as much as edits here: moving the cursor onto
      // a line is what reveals its syntax.
      //
      // So does the syntax tree changing, and that one is easy to miss: in a
      // note of any length CodeMirror parses only as far as it can afford to
      // and finishes the rest in the background. Scrolling asks for
      // decorations over a region that has not been parsed yet, so nothing
      // is found there — and when the parser does catch up it dispatches no
      // doc, selection, or viewport change of its own. Without this, a
      // [[wikilink]] far enough down a long note stays the colour of ordinary
      // text until something else happens to rebuild.
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state) ||
        update.transactions.some((tr) => tr.effects.some((e) => e.is(setVaultIndex)))
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
