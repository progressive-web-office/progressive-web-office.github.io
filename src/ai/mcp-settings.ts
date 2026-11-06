/**
 * AI-012: the MCP servers of the assistant. Their tokens stay in memory
 * unless the user chooses to keep them in this browser (like AI-004).
 */

export interface McpServer {
  id: string;
  name: string;
  url: string;
  /** A bearer token, or ''. */
  token: string;
  rememberToken: boolean;
  enabled: boolean;
}

const KEY = 'pwo.mcp';
let memory: McpServer[] | undefined;

function stored(): McpServer[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Partial<McpServer>[];
    return Array.isArray(raw)
      ? raw
          .filter((s) => typeof s.id === 'string' && typeof s.url === 'string')
          .map((s) => ({ id: s.id!, name: typeof s.name === 'string' && s.name ? s.name : s.url!, url: s.url!, token: s.rememberToken && typeof s.token === 'string' ? s.token : '', rememberToken: s.rememberToken === true, enabled: s.enabled !== false }))
      : [];
  } catch {
    return [];
  }
}

export function loadMcpServers(): McpServer[] {
  memory ??= stored();
  return structuredClone(memory);
}

export function saveMcpServers(servers: McpServer[]): void {
  memory = structuredClone(servers);
  try {
    localStorage.setItem(KEY, JSON.stringify(servers.map((s) => ({ ...s, token: s.rememberToken ? s.token : undefined }))));
  } catch {
    /* storage unavailable: kept for this session */
  }
}

export function addMcpServer(server: Omit<McpServer, 'id' | 'enabled'>): McpServer {
  const added: McpServer = { ...server, name: server.name.trim() || server.url, url: server.url.trim(), token: server.token.trim(), id: crypto.randomUUID(), enabled: true };
  saveMcpServers([...loadMcpServers(), added]);
  return added;
}

export function removeMcpServer(id: string): void {
  saveMcpServers(loadMcpServers().filter((s) => s.id !== id));
}

/** Every token removed from memory and storage. */
export function forgetMcpTokens(): void {
  saveMcpServers(loadMcpServers().map((s) => ({ ...s, token: '', rememberToken: false })));
}

/** Test helper. */
export function resetMcpForTests(): void {
  memory = undefined;
}
