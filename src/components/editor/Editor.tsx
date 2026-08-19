import { useEffect, useRef } from 'react'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { bracketMatching, codeFolding, foldKeymap, foldService } from '@codemirror/language'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap } from '@codemirror/view'
import { useVaultStore } from '../../store/vaultStore'
import { parseFrontmatter } from '../../lib/markdown/parse'
import { wikilinkCompletions } from './completion'
import { setLineRevealer } from './editorHandle'
import { knownTitles, livePreview, setKnownTitles } from './livePreview'
import { editorTheme, markdownHighlighting } from './theme'
import { wikiLinkSyntax } from './wikilinkSyntax'

/** Marks a change made by us loading a note, so it is not echoed back as an edit. */
const External = Annotation.define<boolean>()

/**
 * Frontmatter folds as one unit. Fold commands are on the standard keymap
 * (Ctrl/Cmd-Shift-[), so there is no gutter cluttering the writing surface.
 */
const frontmatterFolding = foldService.of((state, lineStart) => {
  if (lineStart !== 0) return null
  const { to } = parseFrontmatter(state.doc.toString())
  return to > 0 ? { from: state.doc.line(1).to, to } : null
})

export default function Editor() {
  const activeId = useVaultStore((s) => s.activeId)
  const notes = useVaultStore((s) => s.notes)
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const loadedId = useRef<string | null>(null)

  // The editor is created once and then driven by transactions. Re-creating it
  // per render would lose the cursor, the undo history, and the scroll position.
  useEffect(() => {
    if (!host.current) return

    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: '',
        extensions: [
          history(),
          drawSelection(),
          bracketMatching(),
          closeBrackets(),
          codeFolding(),
          frontmatterFolding,
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
          markdown({ extensions: [wikiLinkSyntax] }),
          knownTitles,
          livePreview,
          markdownHighlighting,
          editorTheme,
          EditorView.lineWrapping,
          autocompletion({
            override: [
              wikilinkCompletions(() =>
                useVaultStore.getState().notes.map((note) => note.title),
              ),
            ],
            icons: false,
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            // Loading a note is not an edit; only the user's typing is.
            if (update.transactions.some((tr) => tr.annotation(External))) return
            useVaultStore.getState().edit(update.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            mousedown(event) {
              const target = event.target as HTMLElement | null
              const link = target?.closest('.cm-wikilink')
              const title = link?.getAttribute('data-wikilink')
              if (!title) return false
              // Clicking a link navigates; a link to a note that does not exist
              // yet creates it, as Obsidian does.
              event.preventDefault()
              void useVaultStore.getState().openOrCreate(title)
              return true
            },
          }),
        ],
      }),
    })

    view.current = instance
    setLineRevealer((line) => {
      const doc = instance.state.doc
      const info = doc.line(Math.min(Math.max(line, 1), doc.lines))
      instance.dispatch({
        selection: { anchor: info.from },
        effects: EditorView.scrollIntoView(info.from, { y: 'start', yMargin: 32 }),
      })
      instance.focus()
    })
    return () => {
      setLineRevealer(null)
      view.current = null
      instance.destroy()
    }
  }, [])

  // Swap the document when a different note is opened.
  useEffect(() => {
    const instance = view.current
    if (!instance || !activeId || loadedId.current === activeId) return
    loadedId.current = activeId
    instance.dispatch({
      changes: {
        from: 0,
        to: instance.state.doc.length,
        insert: useVaultStore.getState().content,
      },
      selection: { anchor: 0 },
      annotations: External.of(true),
      scrollIntoView: true,
    })
    // A freshly created note is opened *and* dropped into rename mode at once,
    // so focusing here would blur the rename box out from under the user.
    if (!useVaultStore.getState().renamingId) instance.focus()
  }, [activeId])

  // Creating or renaming a note changes which links resolve.
  useEffect(() => {
    view.current?.dispatch({
      effects: setKnownTitles.of(new Set(notes.map((note) => note.title.toLowerCase()))),
    })
  }, [notes])

  return <div className="editor__cm" ref={host} />
}
