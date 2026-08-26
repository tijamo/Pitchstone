/**
 * Moving a vault in and out of Pitchstone as a zip of `.md` files — the same
 * shape Obsidian itself uses, and what every "export vault" plugin for it
 * produces. Pitchstone has no attachments to carry along, so this only ever
 * deals in markdown text.
 *
 * The pure planning logic (which zip entries count as notes, and what path
 * each lands at) is separated from the JSZip calls so it can be unit tested
 * without a zip file in hand, and so JSZip — a few hundred kB nobody needs
 * until they actually import or export — is only ever reached via a dynamic
 * `import()` from the call site, never from this module's own top level.
 */

import { folderNotePath, sanitizeSegment, uniquePath } from './paths'

export type TransferNote = { path: string; content: string }

/** What an import is about to do, computed entirely client-side before
 * anything is written — so it can be shown to the person for confirmation. */
export type ImportPlan = {
  notes: TransferNote[]
  /** How many of `notes` landed at a different path than the zip gave them,
   * because that path was already taken — by the existing vault or by
   * another entry in the same zip. Never an overwrite: see uniquePath. */
  renamed: number
}

/** A path segment starting with '.' is Obsidian's own bookkeeping (`.obsidian`,
 * `.trash`, `.git`, `.DS_Store`, …), never a note the user meant to bring over. */
function isHidden(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'))
}

/** Directories and anything that isn't markdown text — images, canvases,
 * PDFs, Obsidian's own config — are silently skipped rather than rejected;
 * Pitchstone has nowhere to put an attachment. */
export function shouldImportEntry(path: string, isDir: boolean): boolean {
  return !isDir && !isHidden(path) && /\.md$/i.test(path)
}

/**
 * A zip path into a valid vault path: each segment run through the same
 * `sanitizeSegment` a manual rename would use, `.`/`..`/empty segments
 * dropped, and the extension normalized to lower-case `.md`. Returns null
 * for a path that sanitizes to nothing usable — a stem that was pure illegal
 * characters, or one so long it would fail the vault's own length check —
 * rather than importing a note under some path the sanitizer invented.
 */
export function sanitizeImportPath(rawPath: string): string | null {
  const segments = rawPath.split('/')
  const fileName = segments.pop() ?? ''
  const stem = sanitizeSegment(fileName.replace(/\.md$/i, ''))
  if (!stem) return null

  const dirSegments = segments
    .map(sanitizeSegment)
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')

  const path = [...dirSegments, `${stem}.md`].join('/')
  return path.length >= 4 && path.length <= 512 ? path : null
}

/** The same sanitizing as sanitizeImportPath, but for a directory entry: no
 * extension to normalize, and an empty result (every segment illegal, or the
 * path was the zip root itself) means there's no folder here to keep. */
function sanitizeImportDirPath(rawPath: string): string | null {
  const segments = rawPath
    .split('/')
    .filter((s) => s.length > 0)
    .map(sanitizeSegment)
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')
  return segments.length > 0 ? segments.join('/') : null
}

/**
 * A directory from the zip that ends up with no note anywhere inside it —
 * empty in the source vault — would otherwise vanish without a trace:
 * Pitchstone has no other way to remember a folder exists (see paths.ts's
 * file-level note). Giving it its own note at folderNotePath keeps it alive
 * exactly the way a manually created one would. Only the deepest such
 * directories get one: a note at `A/B/B.md` already keeps `A` around too, so
 * `A` doesn't need a note of its own as well.
 */
function planEmptyFolders(dirPaths: string[], occupiedPaths: Iterable<string>): TransferNote[] {
  const occupied = new Set(occupiedPaths)
  const isEmpty = (dir: string) => {
    const prefix = `${dir}/`
    for (const path of occupied) {
      if (path.startsWith(prefix)) return false
    }
    return true
  }

  const folderNotes: TransferNote[] = []
  // Deepest first, so a folder note created for a nested empty directory
  // already covers its parents by the time they're checked.
  const deepestFirst = [...new Set(dirPaths)].sort(
    (a, b) => b.split('/').length - a.split('/').length,
  )
  for (const dir of deepestFirst) {
    if (!isEmpty(dir)) continue
    const path = folderNotePath(dir)
    occupied.add(path)
    folderNotes.push({ path, content: '' })
  }
  return folderNotes
}

/**
 * Turn raw zip entries into notes ready to insert: sanitized paths, de-duped
 * against both the existing vault and each other the same way a manual
 * rename collision is resolved (`Note.md` → `Note 1.md` → …), and anything
 * that isn't a note at all — a folder, an attachment, Obsidian's own
 * bookkeeping — left out entirely.
 */
export function planImport(
  entries: { path: string; isDir: boolean; content: string }[],
  existingPaths: Iterable<string>,
): ImportPlan {
  const taken = new Set(existingPaths)
  const notes: TransferNote[] = []
  let renamed = 0

  for (const entry of entries) {
    if (!shouldImportEntry(entry.path, entry.isDir)) continue
    const sanitized = sanitizeImportPath(entry.path)
    if (!sanitized) continue

    const path = uniquePath(taken, sanitized)
    if (path !== sanitized) renamed++
    taken.add(path)
    notes.push({ path, content: entry.content })
  }

  return { notes, renamed }
}

// ---------------------------------------------------------------------------
// JSZip glue — kept to two small functions so everything above stays testable
// without a zip file, and so a caller can dynamic-`import()` this module
// without paying for JSZip until one of these actually runs.
// ---------------------------------------------------------------------------

/** Every note in the vault, zipped up at its own path — the same layout
 * Obsidian's own vault folder has, so the result reopens as a vault anywhere. */
export async function exportVault(notes: TransferNote[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const note of notes) zip.file(note.path, note.content)
  return zip.generateAsync({ type: 'blob' })
}

/** Read a zip's markdown files into an import plan — nothing is written yet,
 * so the caller can show it to the person before committing. `existingPaths`
 * is the current vault, so a name already in use is suffixed rather than
 * silently overwritten; see ImportPlan's `renamed` count for how often that
 * happened. */
export async function planImportFromZip(
  file: Blob,
  existingPaths: Iterable<string>,
): Promise<ImportPlan> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file)

  const entries = await Promise.all(
    Object.values(zip.files).map(async (entry) => ({
      path: entry.name,
      isDir: entry.dir,
      content: shouldImportEntry(entry.name, entry.dir) ? await entry.async('string') : '',
    })),
  )

  const plan = planImport(entries, existingPaths)

  const dirPaths = entries
    .filter((e) => e.isDir && !isHidden(e.path))
    .map((e) => sanitizeImportDirPath(e.path))
    .filter((p): p is string => p !== null)
  const folderNotes = planEmptyFolders(dirPaths, [
    ...existingPaths,
    ...plan.notes.map((n) => n.path),
  ])

  return { notes: [...plan.notes, ...folderNotes], renamed: plan.renamed }
}
