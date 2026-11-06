import { beforeEach, describe, expect, it } from 'vitest';
import { McpClient, McpError } from '../src/ai/mcp-client';
import { mcpAgentTools, toolName } from '../src/ai/mcp-tools';
import { addMcpServer, forgetMcpTokens, loadMcpServers, removeMcpServer, resetMcpForTests, saveMcpServers } from '../src/ai/mcp-settings';

// AI-012..AI-014: the assistant as a client of remote MCP servers (Streamable HTTP).

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: { jsonrpc: string; id?: number; method: string; params?: Record<string, unknown> };
}

/** A fake MCP server: answers JSON-RPC requests, as JSON or as server-sent events. */
function server(opts: { sse?: boolean; tools?: unknown[][]; call?: (name: string, args: unknown) => unknown; badInit?: boolean } = {}) {
  const sent: Sent[] = [];
  const pages = opts.tools ?? [[{ name: 'search', description: 'Search the web', inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } }]];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Sent['body'];
    sent.push({ url: String(url), headers: init?.headers as Record<string, string>, body });
    if (body.id === undefined) return new Response(null, { status: 202 });
    let result: unknown;
    if (body.method === 'initialize') result = opts.badInit ? { nope: true } : { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'Fake', version: '1' } };
    else if (body.method === 'tools/list') {
      const i = Number(body.params?.cursor ?? 0);
      result = { tools: pages[i], ...(i + 1 < pages.length ? { nextCursor: String(i + 1) } : {}) };
    } else if (body.method === 'tools/call') result = opts.call ? opts.call(body.params!.name as string, body.params!.arguments) : { content: [{ type: 'text', text: 'ok' }] };
    const message = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
    const headers = { 'Mcp-Session-Id': 'session-1', 'Content-Type': opts.sse ? 'text/event-stream' : 'application/json' };
    return new Response(opts.sse ? `event: message\ndata: ${message}\n\n` : message, { status: 200, headers });
  };
  return { sent, fetchImpl: fetchImpl as typeof fetch };
}

describe('AI-012 a remote MCP server', () => {
  it('is initialised, its session kept, its tools listed page by page', async () => {
    const s = server({ tools: [[{ name: 'a', inputSchema: { type: 'object' } }], [{ name: 'b', inputSchema: { type: 'object' } }]] });
    const client = new McpClient('https://mcp.example.org/mcp', 'secret', s.fetchImpl);
    expect(await client.connect()).toEqual({ name: 'Fake', version: '1' });
    expect((await client.listTools()).map((t) => t.name)).toEqual(['a', 'b']);
    expect(s.sent.map((r) => r.body.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/list']);
    expect(s.sent[0]!.headers.Authorization).toBe('Bearer secret');
    expect(s.sent[0]!.headers.Accept).toBe('application/json, text/event-stream');
    // After the first answer: the session and the version agreed on.
    expect(s.sent[2]!.headers['Mcp-Session-Id']).toBe('session-1');
    expect(s.sent[2]!.headers['MCP-Protocol-Version']).toBe('2025-06-18');
  });

  it('reads answers sent as events too', async () => {
    const client = new McpClient('https://mcp.example.org/mcp', '', server({ sse: true }).fetchImpl);
    await client.connect();
    expect((await client.listTools())[0]!.name).toBe('search');
    expect(await client.callTool('search', { q: 'x' })).toEqual({ text: 'ok', isError: false });
  });

  it('refuses an address that is not HTTPS (except this computer) and answers that are not valid', async () => {
    expect(() => new McpClient('http://mcp.example.org/mcp', '', fetch)).toThrow(McpError);
    expect(() => new McpClient('http://localhost:3000/mcp', '', fetch)).not.toThrow();
    await expect(new McpClient('https://mcp.example.org/mcp', '', server({ badInit: true }).fetchImpl).connect()).rejects.toMatchObject({ kind: 'protocol' });
    const bad = new McpClient('https://mcp.example.org/mcp', '', server({ tools: [[{ description: 'no name' }]] }).fetchImpl);
    await bad.connect();
    await expect(bad.listTools()).rejects.toMatchObject({ kind: 'protocol' });
  });

  it('tells a server out of reach (or refusing web pages) from an error of the server', async () => {
    const down = new McpClient('https://mcp.example.org/mcp', '', (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch);
    await expect(down.connect()).rejects.toMatchObject({ kind: 'network' });
    const denied = new McpClient('https://mcp.example.org/mcp', '', (async () => new Response('no', { status: 401 })) as typeof fetch);
    await expect(denied.connect()).rejects.toMatchObject({ kind: 'http', status: 401 });
  });
});

describe('AI-013 its tools for the assistant', () => {
  it('are named by their server, and each call is approved first', async () => {
    const s = server({ call: (name, args) => ({ content: [{ type: 'text', text: `${name}:${JSON.stringify(args)}` }, { type: 'image', data: 'x', mimeType: 'image/png' }] }) });
    const client = new McpClient('https://mcp.example.org/mcp', '', s.fetchImpl);
    await client.connect();
    const asked: string[] = [];
    let answer = true;
    const tools = mcpAgentTools({ id: 'w', name: 'Web search' }, client, await client.listTools(), async (server, tool, input) => {
      asked.push(`${server.name}/${tool}/${JSON.stringify(input)}`);
      return answer;
    });
    expect(tools[0]).toMatchObject({ name: 'mcp_web_search__search', mutates: false });
    expect(tools[0]!.description).toBe('[MCP server "Web search"] Search the web');
    expect(await tools[0]!.run({ q: 'cats' })).toBe('search:{"q":"cats"}\n[image/png]');
    expect(asked).toEqual(['Web search/search/{"q":"cats"}']);
    answer = false;
    await expect(tools[0]!.run({ q: 'dogs' })).rejects.toThrow('The user declined this call.');
    expect(s.sent.filter((r) => r.body.method === 'tools/call')).toHaveLength(1);
  });

  it('gives names the model accepts', () => {
    expect(toolName('Météo & co', 'get.forecast')).toBe('mcp_meteo_co__get_forecast');
    expect(toolName('x'.repeat(80), 'y').length).toBeLessThanOrEqual(64);
  });

  it('reports an error of a tool as an error', async () => {
    const client = new McpClient('https://mcp.example.org/mcp', '', server({ call: () => ({ content: [{ type: 'text', text: 'quota' }], isError: true }) }).fetchImpl);
    await client.connect();
    const [tool] = mcpAgentTools({ id: 'w', name: 'W' }, client, await client.listTools(), async () => true);
    await expect(tool!.run({ q: 'x' })).rejects.toThrow('quota');
  });

  it('stops using a server whose answers are not valid (AI-014)', async () => {
    let calls = 0;
    const client = new McpClient('https://mcp.example.org/mcp', '', server({ call: () => (calls++ ? { content: [] } : { what: 'ever' }) }).fetchImpl);
    await client.connect();
    const [tool] = mcpAgentTools({ id: 'w', name: 'W' }, client, await client.listTools(), async () => true);
    await expect(tool!.run({ q: 'x' })).rejects.toThrow(/not valid/);
    expect(client.broken).toBe(true);
    await expect(tool!.run({ q: 'x' })).rejects.toThrow(/no longer used/);
    expect(calls).toBe(1);
  });
});

describe('AI-012 the list of servers', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMcpForTests();
  });

  it('keeps a token in this browser only when the user chooses so', () => {
    addMcpServer({ name: 'A', url: 'https://a.example/mcp', token: 'tok-a', rememberToken: false });
    addMcpServer({ name: 'B', url: 'https://b.example/mcp', token: 'tok-b', rememberToken: true });
    expect(loadMcpServers().map((s) => [s.name, s.token, s.enabled])).toEqual([['A', 'tok-a', true], ['B', 'tok-b', true]]);
    const stored = localStorage.getItem('pwo.mcp') ?? '';
    expect(stored).not.toContain('tok-a');
    expect(stored).toContain('tok-b');
    resetMcpForTests();
    expect(loadMcpServers().map((s) => s.token)).toEqual(['', 'tok-b']);
    forgetMcpTokens();
    expect(localStorage.getItem('pwo.mcp')).not.toContain('tok-b');
  });

  it('turns servers off and removes them', () => {
    const a = addMcpServer({ name: 'A', url: 'https://a.example/mcp', token: '', rememberToken: false });
    saveMcpServers(loadMcpServers().map((s) => ({ ...s, enabled: false })));
    expect(loadMcpServers()[0]!.enabled).toBe(false);
    removeMcpServer(a.id);
    expect(loadMcpServers()).toEqual([]);
  });
});
