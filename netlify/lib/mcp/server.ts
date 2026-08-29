/**
 * Pitchstone's MCP server: `POST /mcp`, Streamable HTTP, stateless.
 *
 * Stateless is the whole design. There is no session to resume, no stream to
 * hold open, and no state on this side of the wire — every request carries its
 * own bearer token, does one thing to the vault, and answers. A serverless
 * function cannot honourably keep a connection open anyway, and MCP's
 * Streamable HTTP transport explicitly allows a server to answer a POST with a
 * single JSON response instead of an SSE stream. So GET (which is only ever a
 * request to open a stream) is refused, and no Mcp-Session-Id is ever issued.
 *
 * Hand-rolled rather than built on the MCP SDK: what is implemented below is
 * initialize, ping, tools/list and tools/call over JSON-RPC, which is smaller
 * than the adapter that would be needed to feed the SDK's Node-stream
 * transport from a Web Request.
 *
 * Mounted by netlify/functions/mcp.mts, which is nothing but the route and a
 * default export — everything here runs under Node's test runner instead.
 */
import { TOOLS, TOOLS_BY_NAME } from './tools.ts'
import { VaultError, authorizationServer, vaultInfo } from './vault.ts'

const SERVER_INFO = {
  name: 'pitchstone',
  title: 'Pitchstone',
  version: '1.0.0',
}

/**
 * Newest first. The client's requested version is echoed back when we know it,
 * which is what the spec asks for; anything else gets our preferred one and the
 * client decides whether it can live with that.
 */
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

/**
 * Sent to the client on initialize and generally shown to the model verbatim.
 * This is the only place Pitchstone gets to explain what it is *for*, so it
 * describes the habit rather than the API — the tool descriptions cover the API.
 */
const INSTRUCTIONS = `Pitchstone is a vault of linked markdown notes — a memory that outlives any one
conversation. Prefer it to scratch files: anything worth remembering after this
session should be written here instead.

Notes are addressed by a vault-relative path ending in .md, e.g.
"Memory/2026-08-19.md". Folders exist only for as long as a note sits in one,
so there is nothing to create first — write to a path and its folders appear.

Two things are extracted from a note's text when it is written, and are what
make the vault more than a pile of files:

  [[Wikilinks]]  connect notes by title. A link to a note that does not exist
                 yet is kept and lights up on its own the moment that note is
                 written, so it is always safe to link ahead.
  #tags          classify notes, and can also be listed in frontmatter as
                 "tags: [one, two]".

Working habits that pay off here: search_notes before writing, so a fact is
updated rather than duplicated; link generously, since backlinks are how a note
is found again later; and append to the note that already covers a subject in
preference to starting a near-duplicate.`

// ---------------------------------------------------------------------------
// JSON-RPC
// ---------------------------------------------------------------------------

type Id = string | number | null

type RpcRequest = { jsonrpc: '2.0'; id?: Id; method: string; params?: Record<string, unknown> }

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603

function result(id: Id, value: unknown) {
  return { jsonrpc: '2.0' as const, id, result: value }
}

function failure(id: Id, code: number, message: string) {
  return { jsonrpc: '2.0' as const, id, error: { code, message } }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS, ...headers },
  })
}

// The token is the credential, not the origin, so a permissive CORS policy
// gives a page nothing it could not get with fetch from anywhere else. It does
// let browser-based MCP clients connect, which is the point.
const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version',
  'access-control-max-age': '86400',
}

/**
 * The RFC 9728 discovery URL for this server, at the path an MCP client tries
 * first per the authorization spec's discovery order. Derived from the
 * request's own origin rather than a hardcoded domain, so this keeps working
 * on a branch deploy or in local dev without a second place to update.
 */
function resourceMetadataUrl(request: Request): string {
  return `${new URL(request.url).origin}/.well-known/oauth-protected-resource/mcp`
}

// ---------------------------------------------------------------------------

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (request.method !== 'POST') {
    return json(
      failure(null, INVALID_REQUEST, 'Pitchstone speaks MCP over POST only; it opens no stream.'),
      405,
      { allow: 'POST, OPTIONS' },
    )
  }

  const token = bearer(request)
  if (!token) {
    return json(failure(null, INVALID_REQUEST, 'Missing bearer token.'), 401, {
      'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl(request)}"`,
    })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return json(failure(null, PARSE_ERROR, 'Request body is not JSON.'), 400)
  }

  // A batch of nothing but notifications gets 202 and no body, per the spec.
  const messages = Array.isArray(payload) ? payload : [payload]
  const responses = []
  try {
    for (const message of messages) {
      const response = await dispatch(message as RpcRequest, token)
      if (response) responses.push(response)
    }
  } catch (error) {
    // Only initialize lets an auth failure escape this far, so that a client
    // configured with the wrong token is told at connection time rather than
    // appearing to connect and then failing every call it makes.
    if (error instanceof VaultError && error.kind === 'auth') {
      return json(failure(null, INVALID_REQUEST, 'That token is not valid for this vault.'), 401, {
        'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl(request)}", error="invalid_token"`,
      })
    }
    throw error
  }
  if (responses.length === 0) return new Response(null, { status: 202, headers: CORS })

  return json(Array.isArray(payload) ? responses : responses[0])
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

/** Returns null for a notification, which by definition is not answered. */
async function dispatch(
  message: RpcRequest,
  token: string,
): Promise<ReturnType<typeof result> | ReturnType<typeof failure> | null> {
  if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return failure(null, INVALID_REQUEST, 'Not a JSON-RPC 2.0 message.')
  }

  const id = message.id ?? null
  const isNotification = message.id === undefined || message.id === null
  const params = message.params ?? {}

  try {
    switch (message.method) {
      case 'initialize': {
        // Costs one round trip per session and buys a connection that means
        // something: without it a wrong token connects cleanly and then fails
        // every tool call, which reads as a broken server rather than a typo.
        await vaultInfo(token)

        const asked = params.protocolVersion
        return result(id, {
          protocolVersion:
            typeof asked === 'string' && PROTOCOL_VERSIONS.includes(asked)
              ? asked
              : PROTOCOL_VERSIONS[0],
          // No resources or prompts: everything Pitchstone offers is an action
          // on the vault, and a note is more useful read through read_note —
          // which resolves a title as readily as a path — than pinned as a
          // resource the client has to enumerate first.
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        })
      }

      case 'ping':
        return result(id, {})

      case 'tools/list':
        return result(id, {
          tools: TOOLS.map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: {
              title: tool.title,
              readOnlyHint: tool.readOnly,
              destructiveHint: tool.name === 'delete_note',
              idempotentHint: tool.readOnly || tool.name === 'delete_note',
              openWorldHint: false,
            },
          })),
        })

      case 'tools/call': {
        const name = params.name
        const tool = typeof name === 'string' ? TOOLS_BY_NAME.get(name) : undefined
        if (!tool) return failure(id, INVALID_PARAMS, `No such tool: ${String(name)}`)

        const args = (params.arguments ?? {}) as Record<string, unknown>
        try {
          return result(id, { content: [{ type: 'text', text: await tool.run(token, args) }] })
        } catch (error) {
          // A tool that fails has still been called successfully, so this is a
          // result the model can read and retry from, not a protocol error.
          return result(id, {
            content: [{ type: 'text', text: describe(error) }],
            isError: true,
          })
        }
      }

      default:
        // Notifications we do not handle — notifications/initialized among
        // them — are simply accepted, which is what "no response" means here.
        return isNotification ? null : failure(id, METHOD_NOT_FOUND, `Unknown method: ${message.method}`)
    }
  } catch (error) {
    if (error instanceof VaultError && error.kind === 'auth') throw error
    return failure(id, INTERNAL_ERROR, describe(error))
  }
}

function describe(error: unknown): string {
  if (error instanceof VaultError) {
    if (error.kind === 'auth') {
      return 'That token is not valid for this vault. Create a new one in Pitchstone under Settings → Claude access.'
    }
    if (error.kind === 'conflict') return 'A note already exists at that path.'
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

// ---------------------------------------------------------------------------
// OAuth 2.0 Protected Resource Metadata (RFC 9728)
// ---------------------------------------------------------------------------

const METADATA_CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-max-age': '86400',
}

/**
 * Mounted at /.well-known/oauth-protected-resource and, more specifically,
 * /.well-known/oauth-protected-resource/mcp — an MCP client tries the latter
 * first per the authorization spec's discovery order, and the 401s above
 * point at it directly, but both paths answer the same document since
 * nothing else on this site is a protected resource.
 *
 * `authorization_servers` names Tijamo-hub's own OAuth 2.1 server (its
 * consent screen lives at identity.tijamo.app); Pitchstone issues no tokens
 * of its own; it only ever validates ones that server signed.
 */
export function handleProtectedResourceMetadata(request: Request): Response {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: METADATA_CORS })
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { ...METADATA_CORS, allow: 'GET, OPTIONS' } })
  }

  const origin = new URL(request.url).origin
  return json(
    {
      resource: `${origin}/mcp`,
      authorization_servers: [authorizationServer()],
      bearer_methods_supported: ['header'],
    },
    200,
    METADATA_CORS,
  )
}
