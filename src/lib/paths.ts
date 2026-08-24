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

export type TreeFile<T> = { kind: 'file'; name: string; path: string; note: T }
export type TreeFolder<T> = {
  kind: 'folder'
  name: string
  path: string
  children: TreeNode<T>[]
}
export type TreeNode<T> = TreeFile<T> | TreeFolder<T>

/**
 * Build a folder tree from a flat list of notes. Folders sort before files, and
 * both sort case-insensitively by name — the same ordering Obsidian uses.
 */
export function buildTree<T extends { path: string }>(notes: T[]): TreeNode<T>[] {
  const root: TreeFolder<T> = { kind: 'folder', name: '', path: '', children: [] }

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

    folder.children.push({
      kind: 'file',
      name: fileName.replace(/\.md$/, ''),
      path: note.path,
      note,
    })
  }

  sortTree(root.children)
  return root.children
}

function sortTree<T>(nodes: TreeNode<T>[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  for (const node of nodes) {
    if (node.kind === 'folder') sortTree(node.children)
  }
}
