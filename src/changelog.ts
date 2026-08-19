/**
 * In-app changelog, newest first, keyed by minor version. Kept as plain data
 * (not JSX) so it can also be read by a What's-new surface, the MCP server, or
 * anything else that wants it.
 */
export type ChangelogEntry = {
  ver: string
  title: string
  items: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    ver: '0.4',
    title: 'Backlinks, graph, tags, and search',
    items: [
      'A backlinks panel: every note that links here, with the sentence it links from.',
      'A graph view of the whole vault — drag nodes, scroll to zoom, click one to open it.',
      'A tags browser: every #tag in the vault with its count, click through to the notes carrying it.',
      'Full-text search across every note, with a highlighted matching excerpt.',
    ],
  },
  {
    ver: '0.3',
    title: 'The editor',
    items: [
      'A proper markdown editor: headings, bold, and italics render as you write, with the raw syntax reappearing on the line you are editing.',
      '[[Wikilinks]] render as links — click one to open that note, or to create it if it does not exist yet.',
      'Links to notes that do not exist yet are shown differently, so a typo is obvious.',
      'Type [[ to search your notes by title and insert a link.',
      'An outline of the open note’s headings in the right sidebar; click one to jump to it.',
      'Frontmatter folds away, and lists and brackets close themselves as you type.',
    ],
  },
  {
    ver: '0.2',
    title: 'A real vault',
    items: [
      'Sign in with an email and password, the same as Dodo.',
      'Notes live in Supabase, so your vault follows you between devices.',
      'File explorer with folders, plus create, rename, and delete.',
      'Rename a note with slashes in it — like Projects/Ideas — to move it.',
      'Autosave 0.7s after you stop typing, with save state in the status bar.',
      'Create your account from the sign-in screen — no invite needed.',
    ],
  },
  {
    ver: '0.1',
    title: 'Scaffold',
    items: [
      'Vite + React + TypeScript app, deployed to Netlify on every push to main.',
      'Obsidian-style three-pane shell: ribbon, left sidebar, editor, right sidebar, status bar.',
      'Dark and light themes that follow your system preference, with a manual toggle.',
      'Version shown in the status bar, read straight from package.json.',
    ],
  },
]
