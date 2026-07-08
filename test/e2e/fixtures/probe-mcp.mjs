#!/usr/bin/env node
// Minimal stdio MCP server used only by the e2e harness. It exposes a single
// deterministic tool, `e2e_probe`, that returns a fixed token — so a test can
// prove an MCP installed via Agent Store is actually reachable and callable by
// the agent (claude / codex).
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  { name: 'e2e-probe-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'e2e_probe',
      description: 'Returns the E2E MCP probe token. Call this when asked to run the MCP probe.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'e2e_probe') {
    return { content: [{ type: 'text', text: 'E2E_MCP_OK' }] }
  }
  throw new Error(`Unknown tool: ${req.params.name}`)
})

await server.connect(new StdioServerTransport())
