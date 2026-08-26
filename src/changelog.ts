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
    ver: '0.14',
    title: 'Import and export your vault',
    items: [
      "Settings → Import & export writes every note to a .zip of .md files, laid out the same way an Obsidian vault folder is — frontmatter, [[wikilinks]], and #tags come along as plain text, since that's all a note already is.",
      "Importing reads one of those zips back in: a new note for every .md file inside, nested folders kept, and a name already in the vault renamed rather than overwritten. Attachments and Obsidian's own settings aren't carried over — Pitchstone has nowhere to put them.",
    ],
  },
  {
    ver: '0.13',
    title: 'Sign-ups now wait for approval',
    items: [
      'A new account no longer gets straight in. It waits until the owner approves it — approving unlocks Pitchstone and every other Tijamo app on the same account, since they all share one login.',
      "The owner sees a red badge on the ribbon's Settings icon the moment a sign-up is waiting, plus a browser notification if permission is granted, and approves or rejects it from a new User management section in Settings.",
      'Everyone who already had an account keeps working exactly as before — only sign-ups from this release onward join the queue.',
    ],
  },
  {
    ver: '0.12',
    title: 'What this version does, and how to write',
    items: [
      'Tap the version number — in the status bar, or Settings → About on a phone — to see what changed in every release, this one included.',
      "A new help button in the ribbon opens a syntax reference: [[links]], #tags, formatting, and the frontmatter keys Pitchstone reads (tags: and parent:) — everything a note's own text can do that isn't otherwise discoverable by clicking around.",
    ],
  },
  {
    ver: '0.11',
    title: 'Notes under notes',
    items: [
      'A note can now nest under another note, not just under a folder: add parent: Some Note to its frontmatter and it moves into the file tree under that note, expandable the same way a folder is.',
      'The rule for what parent points at is the same one every [[wikilink]] already follows — a bare title, or a folder-qualified one when the title is not unique — so it behaves exactly as expected without new syntax to learn.',
      "A parent that doesn't resolve to one note, names the note itself, or would close a loop, is left alone rather than guessed at.",
      'A note created manually with no folder of its own — the ribbon’s "+", the empty-editor button, or a wikilink followed with nothing open — now lands in Memory/Notes instead of the vault root.',
    ],
  },
  {
    ver: '0.10',
    title: 'Focus on one branch of the graph',
    items: [
      'Double-click a node in the graph — a note, a folder, or a link to something not written yet — to see just it and what connects to it, radiating outward as branches with no cross-links between them. Double-click empty canvas, or the crosshair button in the corner, to go back to the whole graph.',
      'A folder focuses on its own contents only: what it holds, and how those notes link to each other — never out to wherever else in the vault one of them happens to link.',
      'Selecting a note or folder from the file tree does the same: the graph, wherever you look at it next, is already centred on what you just picked.',
      'Where two branches both lead to the same note, it appears once — reached by whichever path the graph found first — rather than drawing a link back across from the other branch too.',
    ],
  },
  {
    ver: '0.9',
    title: 'When two notes share a name',
    items: [
      'A title only has to be unique enough to say what it means. With per-project notes like gotchas.md now common, the vault disambiguates instead of guessing: the [[ completion list shows the folder next to a name that is not unique, and accepting one writes just enough of the path to pick it out — "Pitchstone/gotchas", not the whole path from the vault root.',
      'A [[link]] now reads three ways: written and unique, not written yet, or ambiguous — a name more than one note answers to. Clicking an ambiguous link, or its placeholder in the graph, opens a small chooser instead of picking one for you.',
      'Search results, backlinks, and a tag’s note list show the folder underneath a title only when something else in that list shares it.',
      'This closes a real gap, not just a display one: reading or writing a note by a bare name that fits more than one used to resolve to whichever the database found first, silently. It now refuses and says so, whether the call came from the app or from Claude over MCP.',
    ],
  },
  {
    ver: '0.8',
    title: 'The vault keeps up',
    items: [
      'Notes Claude writes over MCP now appear as they land — a new note in the tree, an edit in the note you are reading — with no reload. The same goes for the vault open on another device.',
      'It closes a hole. Until now, a note open in the app was saved back whole, so anything Claude added to it while it sat there was quietly overwritten on your next keystroke.',
      'If a note changes while you have unsaved edits in it, Pitchstone stops and asks rather than picking a winner: load theirs, or keep yours. Your edits are held, not saved, until you answer.',
      'Live updates come over a socket, and a tab that has been in the background catches up the moment you look at it again — so it still works if the socket cannot connect.',
    ],
  },
  {
    ver: '0.7',
    title: 'Pitchstone on a phone',
    items: [
      'A real mobile layout. Below 700px the three panes fold to one: the note fills the screen, and the file tree, search, tags, backlinks, outline, and graph become drawers you pull over it.',
      'The ribbon moves to the bottom, where a thumb can reach it. Tapping a panel’s button again puts it away.',
      'Opening a note closes the drawer you opened it from, so you land on the note rather than on the list.',
      'Everything is still there — nothing is desktop-only. The status bar is the one thing that goes, and the answer it was carrying (whether your note is saved) moves up into the header.',
      'Installed on a phone, the app now fits around the notch and the home indicator instead of behind them.',
    ],
  },
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
