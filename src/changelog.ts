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
    ver: '0.6',
    title: 'Claude can use your vault',
    items: [
      'Pitchstone now has its own MCP server, so Claude can read, search, and write your notes — the vault becomes a memory that carries between conversations instead of dying with each one.',
      'Settings → Claude access creates a token and hands you the exact command to connect. The token is shown once and stored only as a hash; lose it and you make another.',
      'Nine tools: read, write, append, search, list, rename, delete, backlinks, and tags. Notes Claude writes get their [[wikilinks]] and #tags read exactly as if you had typed them.',
      'A settings dialog, opened from the cog in the ribbon — where the theme now lives too, with a System option that follows your OS rather than only flipping between the two.',
      'Revoke a token at any time and whatever was using it stops immediately.',
    ],
  },
  {
    ver: '0.5',
    title: 'Install it',
    items: [
      'Pitchstone installs as an app — from the address bar on desktop, or “Add to Home Screen” on a phone — and opens in its own window without browser chrome.',
      'A proper icon: a cut violet stone, on the tab, the home screen, and the sign-in screen.',
      'The app itself opens offline. Your notes still need a connection, since the vault lives in Supabase.',
      'Updates apply on their own, and wait for your last keystroke to save before they do.',
    ],
  },
  {
    ver: '0.4',
    title: 'Backlinks, graph, tags, and search',
    items: [
      'A backlinks panel: every note that links here, with the sentence it links from.',
      'A graph view of the whole vault — drag nodes, scroll to zoom, click one to open it. It sits in the right sidebar, alongside backlinks and the outline.',
      'A tags browser: every #tag in the vault with its count, click through to the notes carrying it.',
      'Full-text search across every note, with a highlighted matching excerpt.',
      'Drag either sidebar’s inner edge to resize it, or double-click that edge to snap it back. Widths are remembered.',
      'Long file trees, outlines, and result lists now scroll inside their panel instead of running off the bottom.',
      'Notes written before this release get their tags and links read on first open, so the tags panel and graph are no longer empty for them.',
      'The graph keeps up as you write — add a [[link]] and it appears, without a reload.',
      'The graph also shows notes you have linked to but not written yet, as hollow circles. Click one to create it.',
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
