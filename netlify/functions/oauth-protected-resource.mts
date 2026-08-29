/**
 * RFC 9728 OAuth 2.0 Protected Resource Metadata for /mcp. Logic lives in
 * netlify/lib/mcp/server.ts, alongside /mcp itself, so the two 401s that
 * point at this document and the document itself can't drift apart; this
 * file is only the route, same as netlify/functions/mcp.mts.
 */
import { handleProtectedResourceMetadata } from '../lib/mcp/server.ts'

export const config = {
  // Both paths an MCP client tries per the authorization spec's discovery
  // order — the specific one first, the bare one as its fallback — answer
  // the same document, since /mcp is the only protected resource this site
  // has.
  path: ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'],
}

export default handleProtectedResourceMetadata
