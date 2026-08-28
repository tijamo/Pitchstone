import { useEffect } from 'react'
import { useUiStore } from '../store/uiStore'

/**
 * A syntax reference, not a tour of the UI — the ribbon and panels are
 * discoverable by clicking around; what a note's own text can do is not.
 */
export function HelpModal() {
  const open = useUiStore((s) => s.helpOpen)
  const close = useUiStore((s) => s.setHelpOpen)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <div
      className="modal"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close(false)
      }}
    >
      <div className="modal__card" role="dialog" aria-modal="true" aria-label="Help">
        <header className="modal__head">
          <h2 className="modal__title">Writing in Pitchstone</h2>
          <button className="modal__close" aria-label="Close help" onClick={() => close(false)}>
            ×
          </button>
        </header>

        <section className="modal__section">
          <h3 className="modal__heading">Links</h3>
          <p className="modal__note">
            <code>[[Note Title]]</code> links to a note by title — type <code>[[</code> and start
            typing to search and insert one. Linking to a title that does not exist yet is fine;
            the note is created the moment you click through, and the link lights up on its own if
            you write that note some other way first.
          </p>
          <p className="modal__note">
            <code>[[Note Title|shown text]]</code> links the same way but displays different text.
          </p>
          <p className="modal__note">
            If more than one note shares a title, qualify it with enough of the path to pick one —{' '}
            <code>[[Projects/Pitchstone/gotchas]]</code> rather than just <code>[[gotchas]]</code>.
            An unqualified link to a shared title is shown differently (dotted) so it is obvious it
            needs qualifying, the same way a link to a title nothing carries yet is shown dashed.
          </p>
          <p className="modal__note">
            The <strong>Check links</strong> button at the top of the file list reads every link in
            the vault at once and lists the ones that need attention, with the corrections it can
            work out for itself — the note a misspelling probably meant, or the qualified form of a
            shared title. One click rewrites the link where it is written.
          </p>
        </section>

        <section className="modal__section">
          <h3 className="modal__heading">Tags</h3>
          <p className="modal__note">
            <code>#tag</code> anywhere in a note's text adds it to the tags panel. Tags can also be
            listed in frontmatter as <code>tags: [one, two]</code>.
          </p>
        </section>

        <section className="modal__section">
          <h3 className="modal__heading">Formatting</h3>
          <p className="modal__note">
            <code>**bold**</code>, <code>*italic*</code>, <code>~~strikethrough~~</code>, and{' '}
            <code>`code`</code> render as you type; the raw syntax reappears only on the line your
            cursor is on. <code>#</code> through <code>######</code> make headings.
          </p>
          <p className="modal__note">
            <code>-</code> or <code>1.</code> at the start of a line makes a list; brackets and list
            markers close themselves as you type.
          </p>
        </section>

        <section className="modal__section">
          <h3 className="modal__heading">Frontmatter</h3>
          <p className="modal__note">
            A block of <code>key: value</code> lines between two <code>---</code> lines at the very
            top of a note. Folds away once written. Two keys mean something to Pitchstone itself:
          </p>
          <p className="modal__note">
            <code>tags: [one, two]</code> — same tags as writing <code>#one #two</code> in the
            body, just listed instead.
          </p>
          <p className="modal__note">
            <code>parent: Note Title</code> — nests this note under that one in the file tree,
            exactly the way a folder nests the notes inside it. Resolves by the same rule as a
            <code>[[link]]</code>: a bare title, or a folder-qualified one if the title is shared. A
            parent that cannot be resolved to exactly one note is ignored, and the note stays where
            its own path puts it.
          </p>
        </section>

        <section className="modal__section">
          <h3 className="modal__heading">Organizing</h3>
          <p className="modal__note">
            Folders are not a separate thing to create — a note's path is its folder, so renaming{' '}
            <code>Ideas.md</code> to <code>Projects/Ideas.md</code> moves it into{' '}
            <code>Projects/</code>, and a folder with nothing left in it simply stops existing.
          </p>
        </section>
      </div>
    </div>
  )
}
