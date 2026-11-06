import { expect, test, type Page, type Route } from '@playwright/test';
import { openApp } from './helpers';

// AI-012..AI-014: the assistant uses the tools of a remote MCP server, each call approved.

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

/** Server-sent events of a Messages API stream. */
function sse(content: Block[], stopReason: string): string {
  const events: [string, unknown][] = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
  ];
  content.forEach((block, index) => {
    if (block.type === 'text') {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } }]);
    } else {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } }]);
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index }]);
  });
  events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 20 } }]);
  events.push(['message_stop', { type: 'message_stop' }]);
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Expose-Headers': 'Mcp-Session-Id' };

/** A remote MCP server with one tool, `lookup`; what it was sent. */
async function mcpServer(page: Page): Promise<{ method: string; auth?: string; session?: string; params?: unknown }[]> {
  const seen: { method: string; auth?: string; session?: string; params?: unknown }[] = [];
  await page.route('https://mcp.example.test/mcp', async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(req.postData() ?? '{}') as { id?: number; method: string; params?: unknown };
    seen.push({ method: body.method, auth: req.headers().authorization, session: req.headers()['mcp-session-id'], params: body.params });
    if (body.id === undefined) return route.fulfill({ status: 202, headers: CORS });
    const result =
      body.method === 'initialize'
        ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'Glossary', version: '1.0' } }
        : body.method === 'tools/list'
          ? { tools: [{ name: 'lookup', description: 'Define a term', inputSchema: { type: 'object', properties: { term: { type: 'string' } }, required: ['term'] } }] }
          : { content: [{ type: 'text', text: 'RSVP: rapid serial visual presentation.' }] };
    await route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Mcp-Session-Id': 'abc' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) });
  });
  return seen;
}

test('the assistant calls a tool of a remote MCP server, approved by the user (AI-012..AI-014)', async ({ page }) => {
  const errors = await openApp(page);
  const seen = await mcpServer(page);
  const requests: { tools: { name: string }[]; messages: unknown[] }[] = [];
  const turns = [sse([{ type: 'tool_use', id: 'toolu_1', name: 'mcp_glossary__lookup', input: { term: 'RSVP' } }], 'tool_use'), sse([{ type: 'text', text: 'It means rapid serial visual presentation.' }], 'end_turn')];
  await page.route('https://api.anthropic.com/**', async (route) => {
    requests.push(JSON.parse(route.request().postData() ?? '{}') as (typeof requests)[number]);
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: turns.shift() ?? sse([], 'end_turn') });
  });

  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('button', { name: 'AI assistant' }).click();
  const panel = page.getByRole('complementary', { name: 'Assistant' });
  await panel.getByLabel('API key', { exact: true }).fill('sk-ant-test');

  // AI-012: added after a check of the server.
  await panel.getByLabel('Name').fill('Glossary');
  await panel.getByLabel('Address of the MCP server').fill('https://mcp.example.test/mcp');
  await panel.getByLabel('Token (optional)').fill('tok-123');
  await panel.getByRole('button', { name: 'Add and check' }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Glossary: 1 tool(s).' })).toBeVisible();
  await expect(panel.getByLabel('Use Glossary')).toBeChecked();
  // An address that is not HTTPS is refused.
  await panel.getByLabel('Address of the MCP server').fill('http://mcp.example.test/mcp');
  await panel.getByRole('button', { name: 'Add and check' }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'https://' })).toBeVisible();
  await panel.getByLabel('Address of the MCP server').fill('');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  // AI-014: the servers in use are shown.
  await expect(panel).toContainText('MCP: Glossary');

  await panel.getByLabel('Message to the assistant').fill('What does RSVP mean?');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('dialog', { name: 'Send this document to the AI provider?' }).getByRole('button', { name: 'Continue' }).click();

  // AI-013: the call is shown, with what is sent, before it goes.
  const call = page.getByRole('dialog', { name: 'Call a tool of an MCP server?' });
  await expect(call).toContainText('lookup');
  await expect(call).toContainText('Glossary (mcp.example.test)');
  await expect(call.locator('pre')).toContainText('"term": "RSVP"');
  await call.getByRole('button', { name: 'Allow once' }).click();
  await expect(panel.locator('.ai-msg.assistant').last()).toHaveText('It means rapid serial visual presentation.');
  await expect(panel.locator('.ai-msg.action')).toContainText('✓ mcp_glossary__lookup');

  expect(requests[0]!.tools.map((t) => t.name)).toContain('mcp_glossary__lookup');
  const callSent = seen.find((s) => s.method === 'tools/call')!;
  expect(callSent).toMatchObject({ auth: 'Bearer tok-123', session: 'abc', params: { name: 'lookup', arguments: { term: 'RSVP' } } });
  // The token was not remembered.
  expect(await page.evaluate(() => localStorage.getItem('pwo.mcp'))).not.toContain('tok-123');
  expect(errors).toEqual([]);
});
