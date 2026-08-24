import { useEffect, useRef } from 'react'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { bracketMatching, codeFolding, foldKeymap, foldService } from '@codemirror/language'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap } from '@codemirror/view'
import { useVaultStore } from '../../store/vaultStore'
import { useUiStore } from '../../store/uiStore'
import { parseFrontmatter } from '../../lib/markdown/parse'
import { matchNotesByTarget } from '../../lib/markdown/resolve'
import { wikilinkCompletions } from './completion'
import { setLineRevealer } from './editorHandle'
import { livePreview, setVaultIndex, vaultIndex } from './livePreview'
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
  const contentVersion = useVaultStore((s) => s.contentVersion)
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const loadedId = useRef<string | null>(null)
  const loadedVersion = useRef<number | null>(null)

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
          // Blinking off entirely rather than tuned to some rate: moving the
          // cursor with the keyboard resets the blink cycle, and a fast
          // typist or arrow-key navigator was catching it in its "off" phase
          // far more than its "on" one — reading as the cursor vanishing
          // rather than as a blink. A solid cursor has no phase to be caught in.
          drawSelection({ cursorBlinkRate: 0 }),
          bracketMatching(),
          closeBrackets(),
          codeFolding(),
          frontmatterFolding,
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
          markdown({ extensions: [wikiLinkSyntax] }),
          vaultIndex,
          livePreview,
          markdownHighlighting,
          editorTheme,
          EditorView.lineWrapping,
          autocompletion({
            override: [wikilinkCompletions(() => useVaultStore.getState().notes)],
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
              const wikiTarget = link?.getAttribute('data-wikilink')
              if (!wikiTarget) return false
              event.preventDefault()

              const matches = matchNotesByTarget(useVaultStore.getState().notes, wikiTarget)
              if (matches.length > 1) {
                // More than one note answers to this — ask, rather than
                // guessing which one the link meant.
                useUiStore.getState().setLinkChoice({
                  x: event.clientX,
                  y: event.clientY,
                  target: wikiTarget,
                  matches,
                })
              } else {
                // Exactly one match opens it; none creates it, as Obsidian does.
                void useVaultStore.getState().openOrCreate(wikiTarget)
              }
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

  // Swap the document whenever the store says its text came from somewhere
  // other than this editor: a different note opened, or the open one reloaded
  // because it changed on the server. One counter covers both, so a live
  // update goes through exactly the path a note switch already did.
  useEffect(() => {
    const instance = view.current
    if (!instance || !activeId) return
    if (loadedId.current === activeId && loadedVersion.current === contentVersion) return

    // Same note, new text: a reload. A different note: a fresh document.
    const reload = loadedId.current === activeId
    loadedId.current = activeId
    loadedVersion.current = contentVersion

    // Reopening the same note at a new version is a reload, and the writer was
    // probably reading somewhere: keep the cursor where it was, clamped to
    // whatever length the text now is. A different note starts at the top.
    const content = useVaultStore.getState().content
    const anchor = reload ? Math.min(instance.state.selection.main.anchor, content.length) : 0

    instance.dispatch({
      changes: { from: 0, to: instance.state.doc.length, insert: content },
      selection: { anchor },
      annotations: External.of(true),
      scrollIntoView: true,
    })
    // A freshly created note is opened *and* dropped into rename mode at once,
    // so focusing here would blur the rename box out from under the user.
    if (!useVaultStore.getState().renamingId) instance.focus()
  }, [activeId, contentVersion])

  // Creating or renaming a note changes which links resolve, and whether a
  // title that used to be unique now has company.
  useEffect(() => {
    view.current?.dispatch({ effects: setVaultIndex.of(notes) })
  }, [notes])

  return <div className="editor__cm" ref={host} />
}
