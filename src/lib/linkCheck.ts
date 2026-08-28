/**
 * Reviewing the vault's `[[wikilinks]]` for the two ways one can fail to name
 * a note: pointing at a title nothing carries, and pointing at a title more
 * than one note carries. Both are already visible one note at a time — dashed
 * and dotted in the editor, hollow on the graph — but a link that broke
 * because a note elsewhere was renamed or deleted is exactly the one nobody
 * is looking at, so this reads the whole vault at once.
 *
 * Matching and qualifying are passed in rather than imported, for the same
 * reason `paths.ts` takes `matchByTarget`: this module has no relative
 * imports, so the tests can run it under Node's type stripping unchanged.
 * `markdown/resolve.ts` is what every caller passes, and it stays the one
 * place the rule lives.
 *
 * A suggestion is only ever a suggestion. Ambiguity has an exact answer — the
 * shortest qualifier that picks one of the notes the title could mean — but a
 * broken link does not: the note it meant may never have been written. So the
 * near-misses are offered in order and the choice stays the writer's.
 */

export type LinkNote = { id: string; title: string; path: string }

/** A link in the vault, as the link table stores it. */
export type LinkRow = {
  source_note_id: string
  target_note_id: string | null
  target_title: string
}

/** `markdown/resolve.ts`'s two rules, handed in — see the note above. */
export type LinkResolver<T> = {
  /** Every note a target could mean: `matchNotesByTarget`. */
  match: (notes: T[], target: string) => T[]
  /** The shortest reference that means only this note: `shortestUniqueSuffix`. */
  qualify: (notes: T[], note: T) => string
}

export type LinkSuggestion<T extends LinkNote = LinkNote> = {
  /** What the link should say instead — the text between the brackets. */
  target: string
  /** The note it would then resolve to. */
  note: T
  /**
   * `qualify` — the same title, said precisely enough to pick one note.
   * `similar` — a different title, close enough to be what was meant.
   */
  reason: 'qualify' | 'similar'
}

export type BrokenLink<T extends LinkNote = LinkNote> = {
  /** Nothing answers to this title, or more than one note does. */
  kind: 'unresolved' | 'ambiguous'
  /** The link's target, exactly as it is written in the note. */
  target: string
  /** The note the link is written in. */
  source: T
  /** Best first; empty when nothing in the vault is close enough. */
  suggestions: LinkSuggestion<T>[]
}

/** How close two titles have to be before one is offered for the other. */
const SIMILAR_ENOUGH = 0.7
/** However many near-misses are worth reading before it becomes a list. */
const MAX_SUGGESTIONS = 4

/** Letters and digits only, lower-cased — so "Note-Title" and "note title"
 * are the same word to a typo check, without being the same to a resolver. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** The part of a link target that names a note, without any folder qualifier. */
function leafOf(target: string): string {
  const segments = target.trim().replace(/\.md$/i, '').split('/')
  return segments[segments.length - 1] ?? ''
}

/** Plain Levenshtein distance. Titles are short; this is not worth optimising. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length]
}

/**
 * 0 to 1, where 1 is "the same word once punctuation and case are set aside".
 * One title containing the other scores well short of that — "Ideas" inside
 * "Product Ideas" is a plausible near-miss, not a certainty — and the shorter
 * the contained half, the less it counts for.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = normalize(a)
  const right = normalize(b)
  if (!left || !right) return 0
  if (left === right) return 1

  const longest = Math.max(left.length, right.length)
  const shortest = Math.min(left.length, right.length)
  const byDistance = 1 - editDistance(left, right) / longest
  const byContainment =
    left.includes(right) || right.includes(left) ? 0.7 + (0.25 * shortest) / longest : 0
  return Math.max(byDistance, byContainment)
}

/**
 * Notes that could plausibly be what a broken link meant, best first. The
 * link's last segment is what gets compared — a qualified link whose folder
 * half is wrong ("Projects/gotchas") is still asking for a note called
 * "gotchas", and offering that note back properly qualified is the fix.
 */
export function suggestTargets<T extends LinkNote>(
  notes: T[],
  target: string,
  resolve: LinkResolver<T>,
): LinkSuggestion<T>[] {
  const leaf = leafOf(target)
  if (!leaf) return []

  return notes
    .map((note) => ({ note, score: titleSimilarity(leaf, note.title) }))
    .filter((match) => match.score >= SIMILAR_ENOUGH)
    .sort((a, b) => b.score - a.score || a.note.path.localeCompare(b.note.path))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ note }) => ({
      target: resolve.qualify(notes, note),
      note,
      reason: 'similar' as const,
    }))
}

/**
 * Every link in the vault that does not name exactly one note.
 *
 * `target_note_id` is not what decides which those are: it is written by SQL
 * at save time and only revisited when a note is created, renamed, or
 * deleted, so the authority on what a target means *now* is the same
 * `matchNotesByTarget` the editor colours with. A row the table still calls
 * unresolved that in fact matches one note today is not a problem, and is
 * left out rather than reported as one.
 */
export function findBrokenLinks<T extends LinkNote>(
  notes: T[],
  links: LinkRow[],
  resolve: LinkResolver<T>,
): BrokenLink<T>[] {
  const byId = new Map(notes.map((note) => [note.id, note]))
  const seen = new Set<string>()
  const broken: BrokenLink<T>[] = []

  for (const row of links) {
    const source = byId.get(row.source_note_id)
    const target = row.target_title?.trim()
    if (!source || !target) continue

    // The same target written twice in one note is one thing to fix, not two.
    const key = `${source.id} ${target.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    const matches = resolve.match(notes, target)
    if (matches.length === 1) continue

    broken.push({
      kind: matches.length > 1 ? 'ambiguous' : 'unresolved',
      target,
      source,
      suggestions:
        matches.length > 1
          ? matches.map((note) => ({
              target: resolve.qualify(notes, note),
              note,
              reason: 'qualify' as const,
            }))
          : suggestTargets(notes, target, resolve),
    })
  }

  return broken.sort(
    (a, b) => a.source.path.localeCompare(b.source.path) || a.target.localeCompare(b.target),
  )
}
