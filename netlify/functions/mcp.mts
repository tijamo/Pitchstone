/**
 * Pitchstone's MCP endpoint. The server itself lives in netlify/lib/mcp so it
 * can be exercised by the test runner without a Netlify build; this file is
 * only the route it answers on.
 */
import { handleMcpRequest } from '../lib/mcp/server.ts'

export const config = {
  // Declaring the path here registers the route ahead of the SPA fallback in
  // netlify.toml, which would otherwise answer /mcp with index.html.
  path: '/mcp',
}

export default handleMcpRequest
