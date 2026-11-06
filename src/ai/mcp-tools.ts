/**
 * AI-013: the tools of an MCP server, for the assistant — named by their
 * server, each call approved by the user first (AI-014: what is sent to the
 * server is what the user saw).
 */
import type { McpClient, McpTool } from './mcp-client';
import type { AgentTool, JsonSchema } from './tools';

export interface McpServerRef {
  id: string;
  name: string;
}

/** Whether the user lets the call go (or allowed that tool for the session). */
export type ApproveCall = (server: McpServerRef, tool: string, input: Record<string, unknown>) => Promise<boolean>;

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** A name the models accept (letters, digits, _ and -, at most 64), telling the server. */
export function toolName(server: string, tool: string): string {
  const s = slug(server).slice(0, 24) || 'server';
  return `mcp_${s}__${slug(tool)}`.slice(0, 64);
}

export function mcpAgentTools(server: McpServerRef, client: McpClient, tools: McpTool[], approve: ApproveCall): AgentTool[] {
  return tools.map((tool) => ({
    name: toolName(server.name, tool.name),
    description: `[MCP server "${server.name}"] ${tool.description ?? tool.name}`,
    // The schema of the server, as it gave it.
    input_schema: { type: 'object', ...tool.inputSchema } as JsonSchema,
    // It does not change the document; each call is approved here.
    mutates: false,
    run: async (input) => {
      if (client.broken) throw new Error(`The MCP server "${server.name}" is no longer used: one of its answers was not valid.`);
      if (!(await approve(server, tool.name, input))) throw new Error('The user declined this call.');
      const out = await client.callTool(tool.name, input);
      if (out.isError) throw new Error(out.text || 'The tool failed.');
      return out.text;
    },
  }));
}
