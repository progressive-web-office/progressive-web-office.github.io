/**
 * AI-012..AI-014: a client of remote MCP servers over the Streamable HTTP
 * transport — JSON-RPC requests POSTed to one address, answered as JSON or as
 * server-sent events. Answers come from another server: each is checked, and
 * a server whose answers are not valid is no longer used.
 */

export const MCP_VERSION = '2025-06-18';

export type McpErrorKind = 'address' | 'network' | 'http' | 'protocol' | 'rpc';

export class McpError extends Error {
  constructor(
    readonly kind: McpErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface RpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: { code?: unknown; message?: unknown };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** HTTPS, or HTTP on this computer only. */
function checkAddress(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new McpError('address', 'not a valid address');
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new McpError('address', 'the address must start with https://');
  return u;
}

/** The JSON-RPC messages of a stream of server-sent events. */
function eventMessages(text: string): unknown[] {
  const out: unknown[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) continue;
    try {
      out.push(JSON.parse(data));
    } catch {
      /* not a JSON message: skipped */
    }
  }
  return out;
}

export class McpClient {
  private readonly url: URL;
  private session: string | undefined;
  private version: string | undefined;
  private next = 1;
  /** AI-014: set when an answer was not valid; the server is then no longer used. */
  broken = false;

  constructor(
    url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {
    this.url = checkAddress(url);
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(this.session ? { 'Mcp-Session-Id': this.session } : {}),
      ...(this.version ? { 'MCP-Protocol-Version': this.version } : {}),
    };
  }

  private invalid(message: string): never {
    this.broken = true;
    throw new McpError('protocol', `the answer of the server is not valid: ${message}`);
  }

  private async post(body: Record<string, unknown>): Promise<Response> {
    if (this.broken) throw new McpError('protocol', 'this server is no longer used: one of its answers was not valid');
    let res: Response;
    try {
      res = await this.fetchImpl(this.url.href, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    } catch (err) {
      throw new McpError('network', `out of reach, or it does not accept calls from a web page (CORS): ${(err as Error).message}`);
    }
    if (!res.ok) throw new McpError('http', `the server answered ${res.status}`, res.status);
    const session = res.headers.get('Mcp-Session-Id');
    if (session) this.session = session;
    return res;
  }

  private async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.next++;
    const res = await this.post({ jsonrpc: '2.0', id, method, params });
    const type = res.headers.get('Content-Type') ?? '';
    const text = await res.text();
    let messages: unknown[];
    if (type.includes('text/event-stream')) messages = eventMessages(text);
    else {
      try {
        messages = [JSON.parse(text)].flat();
      } catch {
        return this.invalid('not JSON');
      }
    }
    const answer = messages.find((m): m is RpcMessage => isObject(m) && m.id === id);
    if (!answer || answer.jsonrpc !== '2.0') return this.invalid(`no answer to ${method}`);
    if (answer.error !== undefined) {
      const message = isObject(answer.error) && typeof answer.error.message === 'string' ? answer.error.message : 'error';
      throw new McpError('rpc', message);
    }
    return answer.result;
  }

  /** Opens the session; resolves with the name and version of the server. */
  async connect(): Promise<{ name: string; version: string }> {
    const result = await this.request('initialize', { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: 'Progressive Web Office', version: '1' } });
    if (!isObject(result) || typeof result.protocolVersion !== 'string' || !isObject(result.serverInfo)) return this.invalid('initialize');
    this.version = result.protocolVersion;
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return { name: String(result.serverInfo.name ?? ''), version: String(result.serverInfo.version ?? '') };
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const result = await this.request('tools/list', cursor ? { cursor } : {});
      if (!isObject(result) || !Array.isArray(result.tools)) return this.invalid('tools/list');
      for (const tool of result.tools) {
        if (!isObject(tool) || typeof tool.name !== 'string' || !tool.name || !isObject(tool.inputSchema)) return this.invalid('a tool without a name or an input schema');
        tools.push({ name: tool.name, ...(typeof tool.description === 'string' ? { description: tool.description } : {}), inputSchema: tool.inputSchema });
      }
      cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined;
      if (!cursor) break;
    }
    return tools;
  }

  /** Calls a tool; its text, the other contents named by their type. */
  async callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    const result = await this.request('tools/call', { name, arguments: args });
    if (!isObject(result) || !Array.isArray(result.content)) return this.invalid('tools/call');
    const parts = result.content.map((c: unknown) => {
      if (!isObject(c)) return '';
      if (c.type === 'text' && typeof c.text === 'string') return c.text;
      if (c.type === 'resource' && isObject(c.resource) && typeof c.resource.text === 'string') return c.resource.text;
      return `[${typeof c.mimeType === 'string' ? c.mimeType : String(c.type)}]`;
    });
    if (!parts.join('') && isObject(result.structuredContent)) parts.push(JSON.stringify(result.structuredContent));
    return { text: parts.filter(Boolean).join('\n'), isError: result.isError === true };
  }
}
