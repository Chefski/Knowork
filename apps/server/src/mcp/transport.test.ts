import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

describe('@modelcontextprotocol/sdk stateless transport', () => {
  it('McpServer.connect throws if reused without close (singleton hazard)', async () => {
    // Documents why buildMcpHandler must create a fresh McpServer per request.
    const server = new McpServer({ name: 'x', version: '1' });
    const t1 = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const t2 = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    await server.connect(t1);
    await expect(server.connect(t2)).rejects.toThrow(/Already connected/);
  });
});
