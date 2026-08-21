/**
 * The tools Pitchstone exposes over MCP, and what each one says back.
 *
 * Results are plain text rather than JSON, because the consumer is a language
 * model reading them, not a program parsing them: a list of paths with dates
 * is both shorter and clearer than the same thing wrapped in braces. Anything
 * that must round-trip exactly — a note's body — is returned verbatim.
 */
import { excerptAround, extractLinks, parseFrontmatter } from '../../../src/lib/markdown/parse.ts'
import { targetMatchesNote } from '../../../src/lib/markdown/resolve.ts'
import * as vault from './vault.ts'
import { VaultError } from './vault.ts'

export type Tool = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  /** True for tools that only read, so a client can present them differently. */
  readOnly: boolean
  run: (token: string, args: Args) => Promise<string>
}

type Args = Record<string, unknown>

/** A required string argument. Empty is allowed — a note may be emptied. */
function text(args: Args, key: string): string {
  const value = args[key]
  if (typeof value !== 'string') {
    throw new VaultError(`Missing required argument "${key}".`, 'invalid')
  }
  return value
}

/** A required argument that has to name something, so blank will not do. */
function ref(args: Args, key: string): string {
  const value = text(args, key).trim()
  if (!value) throw new VaultError(`Argument "${key}" cannot be blank.`, 'invalid')
  return value
}

function optionalStr(args: Args, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function optionalInt(args: Args, key: string): number | undefined {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : 'never')

// ---------------------------------------------------------------------------

const listNotes: Tool = {
  name: 'list_notes',
  title: 'List notes',
  description:
    'List notes in the vault, newest first. Narrow with `folder` (a path prefix ' +
    'such as "Memory/Sessions") or `tag`. Returns paths, tags, size and dates — ' +
    'not content; use read_note for that.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      folder: { type: 'string', description: 'Only notes inside this folder.' },
      tag: { type: 'string', description: 'Only notes carrying this tag, with or without the #.' },
      limit: { type: 'integer', description: 'Maximum notes to return (default 200).' },
    },
  },
  run: async (token, args) => {
    const notes = await vault.listNotes(token, {
      folder: optionalStr(args, 'folder'),
      tag: optionalStr(args, 'tag'),
      limit: optionalInt(args, 'limit'),
    })
    if (notes.length === 0) return 'No notes match.'
    const lines = notes.map((n) => {
      const tags = n.tags.length ? `  #${n.tags.join(' #')}` : ''
      return `${n.path}  (${n.chars} chars, updated ${day(n.updated_at)})${tags}`
    })
    return `${notes.length} note${notes.length === 1 ? '' : 's'}:\n${lines.join('\n')}`
  },
}

const readNote: Tool = {
  name: 'read_note',
  title: 'Read a note',
  description:
    'Read a note in full, by path ("Memory/2026-08-19.md") or just by title ' +
    '("2026-08-19"). Returns the raw markdown, frontmatter and all.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Note path or title.' } },
    required: ['path'],
  },
  run: async (token, args) => {
    const note = await vault.getNote(token, ref(args, 'path'))
    const tags = note.tags.length ? `tags: #${note.tags.join(' #')}\n` : ''
    return (
      `${note.path}\n${tags}updated ${day(note.updated_at)}, created ${day(note.created_at)}\n` +
      `---8<---\n${note.content}`
    )
  },
}

const writeNote: Tool = {
  name: 'write_note',
  title: 'Write a note',
  description:
    'Create a note or rewrite an existing one at `path`. Use mode "append" to add ' +
    'to the end of a note without rewriting it (the usual way to record something ' +
    'new against an ongoing note), "prepend" to add to the top under any ' +
    'frontmatter, or "replace" (the default) to set the whole body. ' +
    '[[Wikilinks]] and #tags in the text are indexed automatically.',
  readOnly: false,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Vault-relative path. Folders are created implicitly; .md is optional.',
      },
      content: { type: 'string', description: 'Markdown to write.' },
      mode: { type: 'string', enum: ['replace', 'append', 'prepend'], default: 'replace' },
    },
    required: ['path', 'content'],
  },
  run: async (token, args) => {
    const path = ref(args, 'path')
    const content = text(args, 'content')
    const mode = optionalStr(args, 'mode') ?? 'replace'

    let next = content
    if (mode === 'append' || mode === 'prepend') {
      // Read-modify-write: the alternative is a second SQL write path that
      // concatenates server-side, and a vault this size is not racing itself.
      const existing = await vault.getNote(token, path).catch((error: unknown) => {
        if (error instanceof VaultError && error.kind === 'not-found') return null
        throw error
      })
      const before = existing?.content ?? ''
      if (!before) next = content
      else if (mode === 'append') next = `${before.replace(/\s*$/, '')}\n\n${content}\n`
      else {
        // Prepending *above* frontmatter would orphan it, so the insert goes
        // after the closing fence when there is one.
        const { bodyFrom } = parseFrontmatter(before)
        next = `${before.slice(0, bodyFrom)}${content}\n\n${before.slice(bodyFrom).replace(/^\s*/, '')}`
      }
    }

    const result = await vault.writeNote(token, path, next)
    const verb = result.created ? 'Created' : mode === 'replace' ? 'Rewrote' : `${mode}ed to`
    return `${verb} ${result.path} (${next.length} chars).`
  },
}

const renameNote: Tool = {
  name: 'rename_note',
  title: 'Rename or move a note',
  description:
    'Rename a note, or move it by giving a `to` path with a different folder. ' +
    'Wikilinks pointing at the old title are re-resolved against the new one.',
  readOnly: false,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The note to move, by path or title.' },
      to: { type: 'string', description: 'Its new vault-relative path.' },
    },
    required: ['path', 'to'],
  },
  run: async (token, args) => {
    const moved = await vault.renameNote(token, ref(args, 'path'), ref(args, 'to'))
    return `Now at ${moved.path}.`
  },
}

const deleteNote: Tool = {
  name: 'delete_note',
  title: 'Delete a note',
  description:
    'Delete a note permanently. Links pointing at it are kept and become ' +
    'unresolved, exactly as if the note had never been written.',
  readOnly: false,
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Note path or title.' } },
    required: ['path'],
  },
  run: async (token, args) => `Deleted ${await vault.deleteNote(token, ref(args, 'path'))}.`,
}

const searchNotes: Tool = {
  name: 'search_notes',
  title: 'Search notes',
  description:
    'Full-text search across every note, ranked by relevance, with the matching ' +
    'phrases in bold. Understands quoted phrases and - to exclude a word. This is ' +
    'the fastest way to find out whether the vault already knows something.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Words to search for.' },
      limit: { type: 'integer', description: 'Maximum results (default 20).' },
    },
    required: ['query'],
  },
  run: async (token, args) => {
    const hits = await vault.searchNotes(token, ref(args, 'query'), optionalInt(args, 'limit'))
    if (hits.length === 0) return 'Nothing in the vault matches that.'
    return hits.map((h) => `${h.path}\n  ${h.snippet.replace(/\s+/g, ' ')}`).join('\n\n')
  },
}

const backlinks: Tool = {
  name: 'backlinks',
  title: 'Backlinks to a note',
  description:
    'Every note that links to this one, with the sentence each link sits in. ' +
    'The way to find the context a note was written for.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Note path or title.' } },
    required: ['path'],
  },
  run: async (token, args) => {
    const path = ref(args, 'path')
    const [note, sources] = await Promise.all([
      vault.getNote(token, path),
      vault.backlinks(token, path),
    ])
    if (sources.length === 0) return `Nothing links to ${note.path}.`

    const lines = sources.map((source) => {
      // A folder-qualified link ("Pitchstone/gotchas") no longer matches this
      // note's bare title, so the excerpt has to be found the same way the
      // link was resolved -- by path, not by a plain string comparison.
      const link = extractLinks(source.content).find((l) => targetMatchesNote(l.target, note))
      const context = link ? excerptAround(source.content, link.from, link.to) : ''
      return `${source.path}${context ? `\n  ${context}` : ''}`
    })
    return `${sources.length} note${sources.length === 1 ? '' : 's'} link to ${note.path}:\n${lines.join('\n')}`
  },
}

const listTags: Tool = {
  name: 'list_tags',
  title: 'List tags',
  description:
    'Every tag in the vault with how many notes carry it, most used first. Useful ' +
    'for finding the conventions already in use before inventing a new one.',
  readOnly: true,
  inputSchema: { type: 'object', properties: {} },
  run: async (token) => {
    const tags = await vault.listTags(token)
    if (tags.length === 0) return 'No tags yet.'
    return tags.map((t) => `#${t.tag}  ${t.uses}`).join('\n')
  },
}

const vaultInfo: Tool = {
  name: 'vault_info',
  title: 'About this vault',
  description:
    'How big the vault is, what folders it uses, when it last changed, and which ' +
    'titles are linked to but not yet written. Worth calling first in a session, ' +
    'to see how this vault is organised before adding to it.',
  readOnly: true,
  inputSchema: { type: 'object', properties: {} },
  run: async (token) => {
    const info = await vault.vaultInfo(token)
    const lines = [
      `${info.notes} notes, ${info.links} links, ${info.tags} tags.`,
      `Last changed ${day(info.last_updated)}.`,
      info.folders.length ? `Folders: ${info.folders.join(', ')}` : 'No folders — every note is at the top level.',
    ]
    if (info.unwritten.length) {
      lines.push(`Linked to but not written yet: ${info.unwritten.join(', ')}`)
    }
    return lines.join('\n')
  },
}

export const TOOLS: Tool[] = [
  vaultInfo,
  listNotes,
  readNote,
  searchNotes,
  writeNote,
  backlinks,
  listTags,
  renameNote,
  deleteNote,
]

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]))
