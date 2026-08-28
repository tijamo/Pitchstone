/**
 * Vault paths.
 *
 * A note's `path` is vault-relative, uses `/` separators, and always ends in
 * `.md` — e.g. `Projects/Pitchstone.md`. Its title is the basename without the
 * extension, derived in the database by trigger so the two can never disagree.
 *
 * Folders are not stored anywhere: they exist exactly as long as a note sits
 * inside one. That keeps renames and moves to a single column update, at the
 * cost of not being able to hold an empty folder open.
 */

/** Characters that would make a path ambiguous or unusable as a filename. */
const ILLEGAL = /[\\:*?"<>|#^[\]]/g

export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

export function titleOf(path: string): string {
  return basename(path).replace(/\.md$/, '')
}

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

/**
 * The id GraphView gives a folder's pseudo-node, keyed by path since folders
 * are never stored (see above) and so have no id of their own. Exported so
 * anything that wants to point the graph at a folder — the file tree's own
 * click handler, at least — builds the same id GraphView does, rather than
 * the two silently disagreeing about what a folder's node is called.
 */
export function folderGraphId(path: string): string {
  return `folder:${path}`
}

/** Strip characters the vault cannot represent, and collapse whitespace. */
export function sanitizeSegment(name: string): string {
  return name.replace(ILLEGAL, '').replace(/\s+/g, ' ').trim()
}

/**
 * The path of a folder's own note, by the same convention Obsidian's "Folder
 * Notes" plugin uses: a note named after its folder, sitting inside it — e.g.
 * `Projects` → `Projects/Projects.md`. This is the only thing that lets a
 * folder with nothing else in it exist at all (see the file-level note on
 * folders never being stored otherwise), and it's why one written this way is
 * exportable and importable like any other note: nothing about it is special
 * to the schema, only to buildTree and the graph, which recognize it and let
 * it stand in for the folder — see extractFolderNotes below.
 */
export function folderNotePath(folderPath: string): string {
  return `${folderPath}/${basename(folderPath)}.md`
}

/**
 * Turn free text typed into a rename box into a full vault path.
 *
 * Slashes are meaningful: typing `Projects/Pitchstone` moves the note into
 * `Projects/`, which is how a move is performed without drag and drop. A name
 * with no slash keeps the note in `currentDir`.
 */
export function toPath(input: string, currentDir: string): string | null {
  const trimmed = input.trim().replace(/\.md$/i, '')
  if (!trimmed) return null

  const explicitDir = trimmed.includes('/')
  const segments = trimmed
    .split('/')
    .map(sanitizeSegment)
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')
  if (segments.length === 0) return null

  const name = segments.pop() as string
  const dir = explicitDir ? segments.join('/') : currentDir
  return `${joinPath(dir, name)}.md`
}

/** `Untitled.md` → `Untitled 1.md` → `Untitled 2.md` … until one is free. */
export function uniquePath(taken: Set<string>, desired: string): string {
  if (!taken.has(desired)) return desired
  const dir = dirname(desired)
  const stem = titleOf(desired)
  for (let n = 1; ; n++) {
    const candidate = `${joinPath(dir, `${stem} ${n}`)}.md`
    if (!taken.has(candidate)) return candidate
  }
}

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

export type TreeFile<T> = {
  kind: 'file'
  name: string
  path: string
  note: T
  /** Other notes nesting under this one via a `parent` frontmatter — see
   * buildTree. Empty for the overwhelming majority of notes. */
  children: TreeNode<T>[]
}
export type TreeFolder<T> = {
  kind: 'folder'
  name: string
  path: string
  children: TreeNode<T>[]
  /** The note at this folder's own `folderNotePath`, if one exists — kept
   * alongside the folder rather than in its place, since it's still a normal
   * note in the list underneath. Lets a folder be opened and focused in the
   * graph like a note, while still drawing with the folder's own icon. */
  note?: T
}
export type TreeNode<T> = TreeFile<T> | TreeFolder<T>

/**
 * Build a tree from a flat list of notes: folders from path, same as always,
 * plus a second pass that re-parents any note naming another one in its
 * `parent` frontmatter — moving it out of wherever its path put it and under
 * that note instead, the way a folder's contents sit under the folder.
 *
 * `matchByTarget` is the caller's `matchNotesByTarget` — passed in rather
 * than imported, deliberately: paths.ts is also imported directly (with a
 * `.ts` specifier) by the MCP server's Node-run code, which cannot resolve
 * this module's own extensionless import of `markdown/resolve.ts` the way
 * Vite does, so paths.ts stays free of relative imports of its own. A
 * `parent` that doesn't resolve to exactly one note, names the note itself,
 * or would close a cycle, is left alone — nesting only helps when it
 * unambiguously terminates. Folders sort before files, and both sort
 * case-insensitively by name, at every level.
 */
export function buildTree<T extends { path: string; title: string; parent?: string | null }>(
  notes: T[],
  matchByTarget: (notes: T[], target: string) => T[],
): TreeNode<T>[] {
  const root: TreeFolder<T> = { kind: 'folder', name: '', path: '', children: [] }
  const fileNodes = new Map<T, TreeFile<T>>()

  for (const note of notes) {
    const segments = note.path.split('/')
    const fileName = segments.pop() as string
    let folder = root

    for (const segment of segments) {
      const folderPath = joinPath(folder.path, segment)
      let next = folder.children.find(
        (child): child is TreeFolder<T> =>
          child.kind === 'folder' && child.name === segment,
      )
      if (!next) {
        next = { kind: 'folder', name: segment, path: folderPath, children: [] }
        folder.children.push(next)
      }
      folder = next
    }

    const fileNode: TreeFile<T> = {
      kind: 'file',
      name: fileName.replace(/\.md$/, ''),
      path: note.path,
      note,
      children: [],
    }
    folder.children.push(fileNode)
    fileNodes.set(note, fileNode)
  }

  reparent(notes, fileNodes, root, matchByTarget)

  sortTree(root.children)
  attachFolderNotes(root.children)
  return root.children
}

/** Recognizes each folder's own note by path convention (see
 * folderNotePath) and attaches it, without removing it from the folder's
 * children — it's still a normal note in the list, just also the folder's. */
function attachFolderNotes<T extends { path: string }>(nodes: TreeNode<T>[]): void {
  for (const node of nodes) {
    if (node.kind !== 'folder') continue
    attachFolderNotes(node.children)
    const ownPath = folderNotePath(node.path)
    const own = node.children.find(
      (child): child is TreeFile<T> => child.kind === 'file' && child.path === ownPath,
    )
    if (own) node.note = own.note
  }
}

/**
 * Each note's single, unambiguous, terminating `parent`, resolved by the
 * caller's own matching rule (`matchNotesByTarget`, passed in for the same
 * reason buildTree takes it — see that function's note).
 *
 * Separated from the tree building because nesting is a relation in its own
 * right, not a detail of the file explorer: the graph draws the same edges,
 * and the two must agree about what nests under what. A `parent` that names
 * more than one note, no note, the note itself, or that would close a cycle,
 * is dropped — nesting only helps when it unambiguously terminates, and a
 * note whose parent is dropped simply stays where its path already puts it.
 */
export function resolveParents<T extends { path: string; title: string; parent?: string | null }>(
  notes: T[],
  matchByTarget: (notes: T[], target: string) => T[],
): Map<T, T> {
  // Resolve every note's own parent first — a bare "matchByTarget" lookup per
  // note — before dropping anything, so cycle detection below sees the whole
  // chain rather than one already being taken apart underneath it.
  const parentOf = new Map<T, T>()
  for (const note of notes) {
    if (!note.parent) continue
    const matches = matchByTarget(notes, note.parent)
    if (matches.length !== 1 || matches[0] === note) continue
    parentOf.set(note, matches[0])
  }
  for (const note of [...parentOf.keys()]) {
    if (!parentOf.has(note)) continue // already cleared by an earlier cycle
    const seen = new Set<T>([note])
    let current = parentOf.get(note)
    while (current) {
      if (seen.has(current)) {
        // `seen` is exactly the cycle's membership at this point — every note
        // walked from `note` up to the repeat. Breaking one link would leave
        // the rest of the chain still resolving into each other; clearing
        // all of them is what actually leaves every note where its path
        // already puts it.
        for (const cycled of seen) parentOf.delete(cycled)
        break
      }
      seen.add(current)
      current = parentOf.get(current)
    }
  }
  return parentOf
}

function reparent<T extends { path: string; title: string; parent?: string | null }>(
  notes: T[],
  fileNodes: Map<T, TreeFile<T>>,
  root: TreeFolder<T>,
  matchByTarget: (notes: T[], target: string) => T[],
): void {
  const parentOf = resolveParents(notes, matchByTarget)

  for (const [note, parentNote] of parentOf) {
    const childNode = fileNodes.get(note)
    const parentNode = fileNodes.get(parentNote)
    if (!childNode || !parentNode) continue
    if (!removeChild(root, childNode)) continue
    parentNode.children.push(childNode)
  }

  pruneEmptyFolders(root)
}

/** Finds and removes `target` from whichever node currently holds it,
 * wherever in the tree that is. True if it was found. */
function removeChild<T>(node: TreeFolder<T> | TreeFile<T>, target: TreeNode<T>): boolean {
  const index = node.children.indexOf(target)
  if (index !== -1) {
    node.children.splice(index, 1)
    return true
  }
  return node.children.some(
    (child) => (child.kind === 'folder' || child.kind === 'file') && removeChild(child, target),
  )
}

/** A folder that has been reparented down to nothing doesn't get to exist —
 * see the file-level note on folders never being stored. */
function pruneEmptyFolders<T>(node: TreeFolder<T> | TreeFile<T>): void {
  node.children = node.children.filter((child) => {
    pruneEmptyFolders(child)
    return child.kind !== 'folder' || child.children.length > 0
  })
}

function sortTree<T>(nodes: TreeNode<T>[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  for (const node of nodes) sortTree(node.children)
}
