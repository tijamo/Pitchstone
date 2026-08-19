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
    ver: '0.2',
    title: 'A real vault',
    items: [
      'Sign in with a magic link — no password to remember.',
      'Notes live in Supabase, so your vault follows you between devices.',
      'File explorer with folders, plus create, rename, and delete.',
      'Rename a note with slashes in it — like Projects/Ideas — to move it.',
      'Autosave 0.7s after you stop typing, with save state in the status bar.',
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
