/**
 * Markdown extraction — the single place `[[wikilinks]]`, `#tags`, headings,
 * and frontmatter are read out of a note's text.
 *
 * This module is deliberately dependency-free and free of browser APIs, so the
 * MCP server (Phase 6) imports exactly the same code the editor uses. Anything
 * that needs to agree between the app and the server belongs here; anything
 * that needs the database — resolving a title to a note id — belongs in SQL.
 */

export type LinkType = 'wikilink' | 'embed'

export type ExtractedLink = {
  /** The note title being linked to, e.g. `Pitchstone` in `[[Pitchstone|it]]`. */
  target: string
  /** Display text after a pipe, if given. */
  alias: string | null
  type: LinkType
  /** Character offsets of the whole link, including its brackets. */
  from: number
  to: number
}

export type Heading = { level: number; text: string; from: number; line: number }

export type Frontmatter = {
  /** Parsed key/value pairs. Empty when the note has no frontmatter block. */
  data: Record<string, unknown>
  /** Character offset where the body starts, after the closing fence. */
  bodyFrom: number
  /** Character offset of the end of the closing fence, or 0 when absent. */
  to: number
}

/**
 * `[[Target]]`, `[[Target|alias]]`, and the `![[Embed]]` form. Wikilinks never
 * span lines, which is what keeps this a safe regex rather than a parser.
 *
 * Brackets are excluded from both halves because a note name cannot contain
 * one — without that, `[[Broken and [[Real]]` would be read as a single link
 * with a nonsense target instead of one unterminated link and one real one.
 * The editor's inline parser (components/editor/wikilinkSyntax.ts) applies the
 * same rule, so the two never disagree about what is a link.
 */
const LINK_RE = /(!?)\[\[([^[\]\n|]+)(?:\|([^[\]\n]*))?\]\]/g

/**
 * A `#tag` must start at a word boundary so `#` inside a URL fragment or a
 * markdown heading is not mistaken for one. Nested tags (`#a/b`) are allowed;
 * a purely numeric tag is not, so `#1` in prose stays prose.
 */
const TAG_RE = /(^|[\s([{<'"])#([A-Za-z][\w-]*(?:\/[\w-]+)*)/g

export function extractLinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = []
  for (const match of content.matchAll(LINK_RE)) {
    const target = match[2].trim()
    if (!target) continue
    links.push({
      target,
      alias: match[3]?.trim() || null,
      type: match[1] === '!' ? 'embed' : 'wikilink',
      from: match.index,
      to: match.index + match[0].length,
    })
  }
  return links
}

/** Unique tags, lower-cased, in the order they first appear. */
export function extractTags(content: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const match of content.matchAll(TAG_RE)) {
    const tag = match[2].toLowerCase()
    if (!seen.has(tag)) {
      seen.add(tag)
      tags.push(tag)
    }
  }
  return tags
}

export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = []
  let offset = 0
  let inFence = false

  content.split('\n').forEach((text, index) => {
    // A `#` inside a fenced code block is a comment, not a heading.
    if (/^\s*(```|~~~)/.test(text)) inFence = !inFence
    else if (!inFence) {
      const match = /^(#{1,6})\s+(.*\S)\s*$/.exec(text)
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2],
          from: offset,
          line: index + 1,
        })
      }
    }
    offset += text.length + 1
  })

  return headings
}

/**
 * A minimal YAML front matter reader: flat `key: value` pairs plus `- item`
 * lists, which covers everything Pitchstone stores. Anything more elaborate is
 * kept as its raw string rather than guessed at.
 */
export function parseFrontmatter(content: string): Frontmatter {
  const empty: Frontmatter = { data: {}, bodyFrom: 0, to: 0 }
  if (!content.startsWith('---')) return empty

  const lines = content.split('\n')
  if (lines[0].trim() !== '---') return empty

  const closing = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (closing === -1) return empty

  const data: Record<string, unknown> = {}
  let listKey: string | null = null

  for (const line of lines.slice(1, closing)) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && listKey) {
      ;(data[listKey] as string[]).push(unquote(item[1]))
      continue
    }

    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!pair) continue
    const [, key, rawValue] = pair
    const value = rawValue.trim()

    if (value === '') {
      // A bare key opens a list; if nothing follows it stays an empty list.
      listKey = key
      data[key] = []
    } else {
      listKey = null
      data[key] = value.startsWith('[') ? parseInlineList(value) : unquote(value)
    }
  }

  const to = lines.slice(0, closing + 1).join('\n').length
  return { data, bodyFrom: Math.min(to + 1, content.length), to }
}

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, '').trim()
}

function parseInlineList(value: string): string[] {
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(unquote)
    .filter((v) => v.length > 0)
}

/**
 * A short, single-line window onto the text around a link — what the backlinks
 * panel shows under each source note, and what the MCP server returns for the
 * same link. Shared so the two never describe one link differently.
 */
export function excerptAround(
  content: string,
  from: number,
  to: number,
  radius = 60,
): string {
  const start = Math.max(0, from - radius)
  const end = Math.min(content.length, to + radius)
  const text = content.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${text}${end < content.length ? '…' : ''}`
}

/**
 * The links table has a unique (source, target_title, link_type), so a target
 * mentioned twice in one note must only be written once. Both writers — the
 * app's save path and the MCP server's — dedupe through this, since both hand
 * the same array to the same SQL function.
 */
export function dedupeLinks(links: ExtractedLink[]): { target: string; type: LinkType }[] {
  const seen = new Set<string>()
  const deduped: { target: string; type: LinkType }[] = []
  for (const link of links) {
    const key = `${link.type}:${link.target}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({ target: link.target, type: link.type })
  }
  return deduped
}

/**
 * Every tag on a note: inline `#tags` from the body plus whatever the
 * frontmatter `tags:` key holds, deduplicated.
 */
export function collectTags(content: string): string[] {
  const { data, bodyFrom } = parseFrontmatter(content)
  const raw = data.tags
  const fromMatter = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string'
      ? raw.split(/[,\s]+/)
      : []

  const seen = new Set<string>()
  const tags: string[] = []
  for (const tag of [...fromMatter, ...extractTags(content.slice(bodyFrom))]) {
    const clean = tag.replace(/^#/, '').trim().toLowerCase()
    if (clean && !seen.has(clean)) {
      seen.add(clean)
      tags.push(clean)
    }
  }
  return tags
}

/**
 * Rewrite every `[[wikilink]]` in `content` whose target is `from` so that it
 * points at `to`, leaving aliases, the `!` of an embed, and everything else in
 * the note exactly as it was.
 *
 * Targets are compared the way a link resolves — trimmed, case-insensitively —
 * so correcting `gotchas` catches `[[Gotchas]]` in the same note. This is the
 * one place a link is edited by anything other than the person typing it, and
 * it works from extractLinks' own offsets rather than a second regex, so the
 * two can never disagree about where a link starts and ends.
 */
export function replaceLinkTarget(content: string, from: string, to: string): string {
  const wanted = from.trim().toLowerCase()
  if (!wanted) return content

  let out = ''
  let cursor = 0
  for (const link of extractLinks(content)) {
    if (link.target.toLowerCase() !== wanted) continue
    const marker = link.type === 'embed' ? '!' : ''
    const alias = link.alias ? `|${link.alias}` : ''
    out += content.slice(cursor, link.from) + `${marker}[[${to}${alias}]]`
    cursor = link.to
  }
  return out + content.slice(cursor)
}
