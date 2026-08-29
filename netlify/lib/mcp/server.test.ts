/**
 * The MCP server's protocol and tool layers, driven the way a client drives
 * them: real Request objects in, real Response objects out.
 *
 * The database is stubbed at the fetch boundary, so what these tests cover is
 * the JSON-RPC framing, the auth handling, argument parsing, path
 * normalization, and the read-modify-write that append and prepend do. They
 * say nothing about whether the SQL is right — the pitchstone_mcp_* functions
 * are verified against the real database, since a hand-written fake of them
 * would only ever agree with itself.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

process.env.VITE_SUPABASE_URL = 'https://vault.test'
process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-for-tests'

const GOOD = 'pst_a_valid_looking_token_value'
const BAD = 'pst_not_a_token_at_all_no_sir'

/** Just enough of a JWT's shape for vault.ts's own unverified decode — the
 * fake below stands in for PostgREST, which is what would really check the
 * signature. */
function fakeJwt(payload: Record<string, unknown>): string {
  const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.sig`
}

const GOOD_JWT = fakeJwt({ sub: 'user-1', role: 'authenticated', client_id: 'oauth-client-1' })
const SESSION_JWT = fakeJwt({ sub: 'user-1', role: 'authenticated' }) // no client_id: not OAuth-issued

type Row = { path: string; content: string; tags: string[]; updated: string }

let vault: Map<string, Row>
const realFetch = globalThis.fetch

/** Just enough PostgREST to answer the RPCs netlify/lib/mcp/vault.ts makes. */
function fakeSupabase(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input)
  const fn = url.slice(url.lastIndexOf('/') + 1)
  const args = JSON.parse(String(init?.body ?? '{}')) as Record<string, never>

  const fail = (code: string, message: string, status = 400) =>
    Promise.resolve(new Response(JSON.stringify({ code, message }), { status }))
  const ok = (value: unknown) => Promise.resolve(new Response(JSON.stringify(value)))

  const headers = (init?.headers ?? {}) as Record<string, string>
  if (args.p_token === null) {
    // OAuth path: real PostgREST would verify the JWT's signature itself
    // before this function ever ran. The fake just checks it's the one
    // these tests consider genuine.
    if (headers.authorization !== `Bearer ${GOOD_JWT}`) return fail('PGRST301', 'JWT invalid', 401)
  } else if (args.p_token !== GOOD) {
    return fail('28000', 'invalid token', 403)
  }

  const titleOf = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/, '')
  const find = (ref: string): Row | undefined =>
    vault.get(ref) ??
    [...vault.values()].find(
      (r) => r.path.toLowerCase() === `${ref.toLowerCase()}.md` ||
        titleOf(r.path).toLowerCase() === ref.toLowerCase(),
    )
  const detail = (row: Row) => ({
    path: row.path,
    title: titleOf(row.path),
    content: row.content,
    tags: row.tags,
    frontmatter: {},
    created_at: row.updated,
    updated_at: row.updated,
  })

  switch (fn) {
    case 'pitchstone_mcp_vault_info':
      return ok({
        notes: vault.size,
        links: 0,
        tags: 0,
        last_updated: '2026-08-19T00:00:00Z',
        folders: [],
        unwritten: [],
      })

    case 'pitchstone_mcp_list_notes':
      return ok(
        [...vault.values()]
          .filter((r) => !args.p_folder || r.path.startsWith(`${args.p_folder}/`))
          .map((r) => ({
            path: r.path,
            title: titleOf(r.path),
            tags: r.tags,
            chars: r.content.length,
            created_at: r.updated,
            updated_at: r.updated,
          })),
      )

    case 'pitchstone_mcp_get_note': {
      const row = find(args.p_path)
      if (!row) return fail('P0002', `no note matching ${args.p_path}`)
      return ok([detail(row)])
    }

    case 'pitchstone_mcp_write_note': {
      const created = !vault.has(args.p_path)
      vault.set(args.p_path, {
        path: args.p_path,
        content: args.p_content,
        tags: args.p_tags ?? [],
        updated: '2026-08-19T00:00:00Z',
      })
      return ok([
        {
          path: args.p_path,
          title: titleOf(args.p_path),
          created,
          updated_at: '2026-08-19T00:00:00Z',
        },
      ])
    }

    case 'pitchstone_mcp_delete_note': {
      const row = find(args.p_path)
      if (!row) return fail('P0002', `no note matching ${args.p_path}`)
      vault.delete(row.path)
      return ok(row.path)
    }

    case 'pitchstone_mcp_search':
      return ok(
        [...vault.values()]
          .filter((r) => r.content.toLowerCase().includes(String(args.p_query).toLowerCase()))
          .map((r) => ({ path: r.path, title: titleOf(r.path), snippet: `**${args.p_query}**` })),
      )

    case 'pitchstone_mcp_backlinks': {
      const row = find(args.p_path)
      if (!row) return fail('P0002', `no note matching ${args.p_path}`)
      const title = titleOf(row.path)
      return ok(
        [...vault.values()]
          .filter((r) => r.content.includes(`[[${title}]]`))
          .map((r) => ({ path: r.path, title: titleOf(r.path), content: r.content })),
      )
    }

    case 'pitchstone_mcp_tags':
      return ok([{ tag: 'memory', uses: vault.size }])

    default:
      return fail('42883', `no function ${fn}`, 404)
  }
}

const { handleMcpRequest } = await import('./server.ts')

/** One JSON-RPC call over the transport, as a client would make it. */
async function call(body: unknown, token: string | null = GOOD) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return handleMcpRequest(
    new Request('https://pitchstone.test/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  )
}

type Rpc<T> = { result: T; error?: { code: number; message: string } }

async function rpc<T>(
  method: string,
  params?: Record<string, unknown>,
  token = GOOD,
): Promise<Rpc<T>> {
  const response = await call({ jsonrpc: '2.0', id: 1, method, params }, token)
  return (await response.json()) as Rpc<T>
}

/** tools/call, unwrapped to the text the model would actually read. */
async function callTool(name: string, args: Record<string, unknown> = {}, token = GOOD) {
  const body = await rpc<{ content: { text: string }[]; isError?: boolean }>(
    'tools/call',
    { name, arguments: args },
    token,
  )
  return { text: body.result.content[0].text, isError: body.result.isError === true }
}

before(() => {
  globalThis.fetch = fakeSupabase as typeof fetch
})

after(() => {
  globalThis.fetch = realFetch
})

describe('transport', () => {
  before(() => {
    vault = new Map()
  })

  it('refuses anything but POST, since it opens no stream', async () => {
    const response = await handleMcpRequest(
      new Request('https://pitchstone.test/mcp', { method: 'GET' }),
    )
    assert.equal(response.status, 405)
  })

  it('answers a preflight so browser clients can connect', async () => {
    const response = await handleMcpRequest(
      new Request('https://pitchstone.test/mcp', { method: 'OPTIONS' }),
    )
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
  })

  it('requires a bearer token, and points at where to get one', async () => {
    const response = await call({ jsonrpc: '2.0', id: 1, method: 'ping' }, null)
    assert.equal(response.status, 401)
    assert.match(
      response.headers.get('www-authenticate') ?? '',
      /^Bearer resource_metadata="https:\/\/pitchstone\.test\/\.well-known\/oauth-protected-resource\/mcp"$/,
    )
  })

  it('rejects a token the vault does not know, at connection time', async () => {
    const response = await call(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      BAD,
    )
    assert.equal(response.status, 401)
    assert.match(response.headers.get('www-authenticate') ?? '', /error="invalid_token"/)
  })

  it('rejects a body that is not JSON', async () => {
    const response = await handleMcpRequest(
      new Request('https://pitchstone.test/mcp', {
        method: 'POST',
        headers: { authorization: `Bearer ${GOOD}`, 'content-type': 'application/json' },
        body: 'not json',
      }),
    )
    assert.equal(response.status, 400)
  })

  it('accepts a notification without answering it', async () => {
    const response = await call({ jsonrpc: '2.0', method: 'notifications/initialized' })
    assert.equal(response.status, 202)
    assert.equal(await response.text(), '')
  })

  it('answers a batch with a batch', async () => {
    const response = await call([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', id: 2, method: 'ping' },
    ])
    const body = (await response.json()) as { id: number }[]
    assert.deepEqual(
      body.map((m) => m.id),
      [1, 2],
    )
  })

  it('reports an unknown method rather than failing silently', async () => {
    const body = await rpc<never>('resources/list')
    assert.equal(body.error?.code, -32601)
  })
})

describe('OAuth', () => {
  before(() => {
    vault = new Map()
  })

  it('accepts an OAuth-issued JWT in place of a personal token', async () => {
    const { text, isError } = await callTool('vault_info', {}, GOOD_JWT)
    assert.ok(!isError, text)
    assert.match(text, /notes, /)
  })

  it('refuses a plain session JWT with no client_id claim', async () => {
    const { text, isError } = await callTool('vault_info', {}, SESSION_JWT)
    assert.ok(isError)
    assert.match(text, /not valid for this vault/i)
  })

  it('refuses a token that is neither pst_ nor JWT-shaped', async () => {
    const { text, isError } = await callTool('vault_info', {}, 'not-a-real-token')
    assert.ok(isError)
    assert.match(text, /not valid for this vault/i)
  })

  it('serves RFC 9728 protected resource metadata', async () => {
    const { handleProtectedResourceMetadata } = await import('./server.ts')
    const response = handleProtectedResourceMetadata(
      new Request('https://pitchstone.test/.well-known/oauth-protected-resource/mcp'),
    )
    assert.equal(response.status, 200)
    const body = (await response.json()) as {
      resource: string
      authorization_servers: string[]
      bearer_methods_supported: string[]
    }
    assert.equal(body.resource, 'https://pitchstone.test/mcp')
    assert.deepEqual(body.authorization_servers, ['https://vault.test/auth/v1'])
    assert.deepEqual(body.bearer_methods_supported, ['header'])
  })

  it('answers a preflight on the metadata route too', async () => {
    const { handleProtectedResourceMetadata } = await import('./server.ts')
    const response = handleProtectedResourceMetadata(
      new Request('https://pitchstone.test/.well-known/oauth-protected-resource/mcp', {
        method: 'OPTIONS',
      }),
    )
    assert.equal(response.status, 204)
  })

  it('refuses anything but GET or OPTIONS on the metadata route', async () => {
    const { handleProtectedResourceMetadata } = await import('./server.ts')
    const response = handleProtectedResourceMetadata(
      new Request('https://pitchstone.test/.well-known/oauth-protected-resource/mcp', {
        method: 'POST',
      }),
    )
    assert.equal(response.status, 405)
  })
})

describe('initialize', () => {
  before(() => {
    vault = new Map()
  })

  it('echoes a protocol version it knows', async () => {
    const body = await rpc<{
      protocolVersion: string
      serverInfo: { name: string }
      instructions: string
    }>('initialize', { protocolVersion: '2024-11-05' })
    assert.equal(body.result.protocolVersion, '2024-11-05')
    assert.equal(body.result.serverInfo.name, 'pitchstone')
    assert.match(body.result.instructions, /\[\[Wikilinks\]\]/)
  })

  it('falls back to its own version for one it does not', async () => {
    const body = await rpc<{ protocolVersion: string }>('initialize', {
      protocolVersion: '1999-01-01',
    })
    assert.equal(body.result.protocolVersion, '2025-06-18')
  })
})

describe('tools/list', () => {
  before(() => {
    vault = new Map()
  })

  it('describes every tool with a schema', async () => {
    const body = await rpc<{
      tools: { name: string; description: string; inputSchema: object }[]
    }>('tools/list')
    const names = body.result.tools.map((t) => t.name).sort()
    assert.deepEqual(names, [
      'backlinks',
      'delete_note',
      'list_notes',
      'list_tags',
      'read_note',
      'rename_note',
      'search_notes',
      'vault_info',
      'write_note',
    ])
    for (const tool of body.result.tools) {
      assert.ok(tool.description.length > 20, `${tool.name} needs a real description`)
      assert.equal((tool.inputSchema as { type: string }).type, 'object')
    }
  })

  it('names an unknown tool as a caller error', async () => {
    const body = await rpc<never>('tools/call', { name: 'drop_vault', arguments: {} })
    assert.equal(body.error?.code, -32602)
  })
})

describe('writing', () => {
  before(() => {
    vault = new Map()
  })

  it('creates a note, adding .md and folders from the path alone', async () => {
    const { text } = await callTool('write_note', {
      path: 'Memory/Sessions/2026-08-19',
      content: 'Built the MCP server. See [[Pitchstone]]. #memory',
    })
    assert.match(text, /^Created Memory\/Sessions\/2026-08-19\.md/)
    assert.ok(vault.has('Memory/Sessions/2026-08-19.md'))
  })

  it('rewrites an existing note in place', async () => {
    const { text } = await callTool('write_note', {
      path: 'Memory/Sessions/2026-08-19.md',
      content: 'Rewritten.',
    })
    assert.match(text, /^Rewrote /)
    assert.equal(vault.get('Memory/Sessions/2026-08-19.md')?.content, 'Rewritten.')
  })

  it('appends below what is already there', async () => {
    await callTool('write_note', {
      path: 'Memory/Sessions/2026-08-19.md',
      content: 'And then this.',
      mode: 'append',
    })
    assert.equal(
      vault.get('Memory/Sessions/2026-08-19.md')?.content,
      'Rewritten.\n\nAnd then this.\n',
    )
  })

  it('appending to a note that does not exist yet just creates it', async () => {
    const { text } = await callTool('write_note', {
      path: 'Memory/Brand new',
      content: 'First line.',
      mode: 'append',
    })
    assert.match(text, /^Created /)
    assert.equal(vault.get('Memory/Brand new.md')?.content, 'First line.')
  })

  it('prepends under the frontmatter rather than above it', async () => {
    vault.set('Topics/Ideas.md', {
      path: 'Topics/Ideas.md',
      content: '---\ntags: [ideas]\n---\n\nAn older idea.\n',
      tags: ['ideas'],
      updated: '2026-08-19T00:00:00Z',
    })
    await callTool('write_note', {
      path: 'Topics/Ideas.md',
      content: 'A newer idea.',
      mode: 'prepend',
    })
    assert.equal(
      vault.get('Topics/Ideas.md')?.content,
      '---\ntags: [ideas]\n---\nA newer idea.\n\nAn older idea.\n',
    )
  })

  it('refuses a path with nothing usable left in it', async () => {
    const { isError, text } = await callTool('write_note', { path: '///', content: 'x' })
    assert.ok(isError)
    assert.match(text, /not a usable note path/)
  })

  it('will not write without content', async () => {
    const { isError, text } = await callTool('write_note', { path: 'Anything' })
    assert.ok(isError)
    assert.match(text, /Missing required argument "content"/)
  })
})

describe('reading', () => {
  before(async () => {
    vault = new Map()
    await callTool('write_note', {
      path: 'Memory/Today',
      content: 'Today we built the [[MCP server]].',
    })
  })

  it('reads a note by title as readily as by path', async () => {
    const byPath = await callTool('read_note', { path: 'Memory/Today.md' })
    const byTitle = await callTool('read_note', { path: 'Today' })
    assert.equal(byPath.text, byTitle.text)
    assert.match(byPath.text, /Today we built the \[\[MCP server\]\]\./)
  })

  it('says plainly when there is no such note', async () => {
    const { isError, text } = await callTool('read_note', { path: 'Never written' })
    assert.ok(isError)
    assert.match(text, /no note matching/i)
  })

  it('lists a folder', async () => {
    const { text } = await callTool('list_notes', { folder: 'Memory' })
    assert.match(text, /Memory\/Today\.md/)
  })

  it('searches', async () => {
    const { text } = await callTool('search_notes', { query: 'built' })
    assert.match(text, /Memory\/Today\.md/)
  })

  it('reports backlinks with the sentence the link sits in', async () => {
    await callTool('write_note', { path: 'MCP server', content: 'Notes on it.' })
    const { text } = await callTool('backlinks', { path: 'MCP server' })
    assert.match(text, /Memory\/Today\.md/)
    assert.match(text, /Today we built the \[\[MCP server\]\]\./)
  })

  it('summarises the vault', async () => {
    const { text } = await callTool('vault_info', {})
    assert.match(text, /notes, /)
  })
})

describe('moving and deleting', () => {
  before(async () => {
    vault = new Map()
    await callTool('write_note', { path: 'Scratch', content: 'x' })
  })

  it('deletes by title', async () => {
    const { text } = await callTool('delete_note', { path: 'Scratch' })
    assert.equal(text, 'Deleted Scratch.md.')
    assert.equal(vault.size, 0)
  })

  it('reports a delete that matched nothing', async () => {
    const { isError } = await callTool('delete_note', { path: 'Scratch' })
    assert.ok(isError)
  })
})
