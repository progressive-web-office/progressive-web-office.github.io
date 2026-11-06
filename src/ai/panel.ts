/** Assistant side panel (AI-001..AI-005). */
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { busyText, button, h } from '../app/dom';
import { getLocale, t } from '../i18n';
import { createStreamFactory, runAgent, systemPrompt, type Effort } from './agent';
import { PROVIDERS, providerById, type ProviderId } from './providers';
import { activeProfile, EFFORTS, forgetApiKey, giveConsent, hasConsent, loadAiSettings, saveAiSettings, type AiSettings } from './settings';
import type { AgentTool } from './tools';
import { addMcpServer, forgetMcpTokens, loadMcpServers, removeMcpServer, saveMcpServers, type McpServer } from './mcp-settings';
import type { McpServerRef } from './mcp-tools';

export interface AssistantContext {
  kind: string;
  name: string;
  tools: AgentTool[];
}

export interface AssistantHost {
  /** Tools for the open document, or null when there is none. */
  context(): AssistantContext | null;
  /** Capture the document; the returned function restores it (AI-003). */
  snapshot(): Promise<() => Promise<void>>;
  confirm(title: string, message: string): Promise<boolean>;
  close(): void;
}

const summarize = (input: unknown): string => {
  const s = JSON.stringify(input) ?? '';
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
};

export class AssistantPanel {
  readonly element: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly setup: HTMLElement;
  private readonly info: HTMLElement;
  /** Conversation in the format of the provider that produced it. */
  private history: unknown[] = [];
  private historyProvider: ProviderId | undefined;
  private controller: AbortController | null = null;
  /** AI-013: the servers connected in this session, with their tools. */
  private readonly mcp = new Map<string, { url: string; token: string; tools: AgentTool[] }>();
  /** AI-013: the tools the user allowed for the session, `server/tool`. */
  private readonly allowed = new Set<string>();

  constructor(private readonly host: AssistantHost) {
    this.info = h('p', { class: 'ai-info' });
    this.log = h('div', { class: 'ai-log', role: 'log', 'aria-live': 'polite', 'aria-label': t('ai.conversation') });
    this.input = h('textarea', { rows: 3, 'aria-label': t('ai.prompt'), placeholder: t('ai.placeholder') });
    this.sendButton = button(t('ai.send'), () => void this.send(), { className: 'primary' });
    this.stopButton = button(t('ai.stop'), () => this.controller?.abort());
    this.stopButton.hidden = true;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.send();
      }
    });
    this.setup = this.buildSetup();
    this.element = h(
      'aside',
      { class: 'ai-panel', 'aria-label': t('ai.title') },
      h(
        'div',
        { class: 'ai-head' },
        h('h2', {}, `✨ ${t('ai.title')}`),
        button(t('ai.settings'), () => this.toggleSetup(), { text: '⚙', className: 'icon' }),
        button(t('common.close'), () => this.host.close(), { text: '×', className: 'icon' }),
      ),
      this.info,
      this.setup,
      this.log,
      h('div', { class: 'ai-input' }, this.input, h('div', { class: 'dialog-actions' }, this.stopButton, this.sendButton)),
    );
    this.refreshInfo();
    this.setup.hidden = ready(loadAiSettings());
  }

  /** New document: start a new conversation. */
  reset(): void {
    this.controller?.abort();
    this.history = [];
    this.log.replaceChildren();
  }

  focus(): void {
    (this.setup.hidden ? this.input : this.setup.querySelector<HTMLInputElement>('input'))?.focus();
  }

  private refreshInfo(): void {
    const s = loadAiSettings();
    const servers = loadMcpServers().filter((m) => m.enabled);
    // AI-014: which MCP servers are in use.
    this.info.textContent = t('ai.info', { provider: providerById(s.provider).label, model: activeProfile(s).model || '—' }) + (servers.length ? ` · ${t('ai.mcp.inUse', { names: servers.map((m) => m.name).join(', ') })}` : '');
  }

  /** AI-012: the MCP servers — added after a check, turned on or off, removed. */
  private buildMcp(): HTMLElement {
    const list = h('ul', { class: 'ai-mcp-list', role: 'list' });
    const status = h('p', { class: 'hint', role: 'status' });
    const name = h('input', { type: 'text', 'aria-label': t('ai.mcp.name'), placeholder: t('ai.mcp.name') });
    const url = h('input', { type: 'url', spellcheck: 'false', 'aria-label': t('ai.mcp.url'), placeholder: 'https://…' });
    const token = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': t('ai.mcp.token'), placeholder: t('ai.mcp.token') });
    const remember = h('input', { type: 'checkbox' });
    const render = (): void => {
      const servers = loadMcpServers();
      list.replaceChildren(
        ...(servers.length
          ? servers.map((server) => {
              const on = h('input', { type: 'checkbox', checked: server.enabled, 'aria-label': t('ai.mcp.enabled', { name: server.name }) });
              on.addEventListener('change', () => {
                saveMcpServers(loadMcpServers().map((m) => (m.id === server.id ? { ...m, enabled: on.checked } : m)));
                this.refreshInfo();
              });
              return h(
                'li',
                {},
                h('label', { class: 'git-row' }, on, ' ', server.name, h('span', { class: 'hint' }, ` — ${hostOf(server.url)}`)),
                button(t('ai.mcp.remove'), () => {
                  removeMcpServer(server.id);
                  this.mcp.delete(server.id);
                  render();
                  this.refreshInfo();
                }, { text: '×', className: 'icon', title: t('ai.mcp.remove') }),
              );
            })
          : [h('li', { class: 'hint' }, t('ai.mcp.none'))]),
      );
    };
    const add = async (): Promise<void> => {
      const address = url.value.trim();
      if (!address) return url.focus();
      status.textContent = t('ai.mcp.checking');
      try {
        const tools = await this.checkServer(address, token.value.trim());
        const server = addMcpServer({ name: name.value.trim() || hostOf(address), url: address, token: token.value, rememberToken: remember.checked });
        status.textContent = t('ai.mcp.ok', { name: server.name, n: tools });
        name.value = url.value = token.value = '';
        remember.checked = false;
        render();
        this.refreshInfo();
      } catch (err) {
        status.textContent = t('ai.mcp.failed', { name: hostOf(address), message: (err as Error).message });
      }
    };
    render();
    return h(
      'fieldset',
      { class: 'ai-mcp' },
      h('legend', {}, t('ai.mcp.title')),
      h('p', { class: 'hint' }, t('ai.mcp.help')),
      list,
      name,
      url,
      token,
      h('label', { class: 'git-row' }, remember, ' ', t('ai.mcp.rememberToken')),
      h('div', { class: 'dialog-actions' }, button(t('ai.mcp.add'), () => void add())),
      status,
    );
  }

  /** AI-012: a server checked — its session opened, its tools listed; resolves with their number. */
  private async checkServer(url: string, token: string): Promise<number> {
    const { McpClient } = await import('./mcp-client');
    const client = new McpClient(url, token);
    await client.connect();
    return (await client.listTools()).length;
  }

  /** AI-013: the tools of the servers turned on, connected once per session; a server failing is said and left aside. */
  private async mcpTools(): Promise<AgentTool[]> {
    const servers = loadMcpServers().filter((m) => m.enabled);
    if (!servers.length) return [];
    const [{ McpClient }, { mcpAgentTools }] = await Promise.all([import('./mcp-client'), import('./mcp-tools')]);
    const out: AgentTool[] = [];
    for (const server of servers) {
      let known = this.mcp.get(server.id);
      if (!known || known.url !== server.url || known.token !== server.token) {
        try {
          const client = new McpClient(server.url, server.token);
          await client.connect();
          known = { url: server.url, token: server.token, tools: mcpAgentTools(server, client, await client.listTools(), (s, tool, input) => this.approve(s, server, tool, input)) };
          this.mcp.set(server.id, known);
        } catch (err) {
          this.entry('error', t('ai.mcp.failed', { name: server.name, message: (err as Error).message }));
          continue;
        }
      }
      out.push(...known.tools);
    }
    return out;
  }

  /** AI-013, AI-014: the user sees the server, the tool and what is sent, and lets it go once or for the session. */
  private approve(ref: McpServerRef, server: McpServer, tool: string, input: Record<string, unknown>): Promise<boolean> {
    const key = `${ref.id}/${tool}`;
    if (this.allowed.has(key)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'mcp-call-title' });
      const finish = (ok: boolean, session = false): void => {
        if (ok && session) this.allowed.add(key);
        dialog.close();
        dialog.remove();
        resolve(ok);
      };
      const args = JSON.stringify(input, null, 2);
      dialog.append(
        h('h2', { id: 'mcp-call-title' }, t('ai.mcp.callTitle')),
        h('p', {}, t('ai.mcp.callMessage', { tool, server: ref.name, host: hostOf(server.url) })),
        h('pre', { class: 'ai-mcp-args' }, args.length > 4000 ? `${args.slice(0, 4000)}…` : args),
        h(
          'div',
          { class: 'dialog-actions' },
          button(t('common.cancel'), () => finish(false)),
          button(t('ai.mcp.allowSession'), () => finish(true, true)),
          button(t('ai.mcp.allowOnce'), () => finish(true), { className: 'primary' }),
        ),
      );
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        finish(false);
      });
      document.body.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
  }

  private toggleSetup(): void {
    this.setup.hidden = !this.setup.hidden;
    if (!this.setup.hidden) this.setup.querySelector<HTMLInputElement>('input')?.focus();
  }

  private buildSetup(): HTMLElement {
    let settings = loadAiSettings();
    const provider = h('select', { 'aria-label': t('ai.provider') }, ...PROVIDERS.map((p) => h('option', { value: p.id, selected: p.id === settings.provider }, p.label)));
    const key = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': t('ai.apiKey') });
    const keyHelp = h('p', { class: 'hint' });
    const remember = h('input', { type: 'checkbox', checked: settings.remember });
    const baseUrl = h('input', { type: 'url', spellcheck: 'false', 'aria-label': t('ai.baseUrl') });
    const model = h('input', { type: 'text', spellcheck: 'false', 'aria-label': t('ai.model') });
    const effort = h('select', { 'aria-label': t('ai.effort') }, ...EFFORTS.map((e) => h('option', { value: e, selected: e === settings.effort }, t(`ai.effort.${e}`))));
    const keyRow = h('label', {}, t('ai.apiKey'), key);
    const urlRow = h('label', {}, t('ai.baseUrl'), baseUrl);
    const effortRow = h('label', {}, t('ai.effort'), effort);
    // Show the profile of the selected provider; edits are kept per provider.
    const show = (): void => {
      const p = providerById(provider.value);
      const profile = settings.profiles[p.id];
      key.value = profile.apiKey;
      key.placeholder = p.needsKey ? '' : t('ai.keyOptional');
      keyHelp.textContent = t(p.keyHelp);
      baseUrl.value = profile.baseUrl;
      urlRow.hidden = !p.editableUrl;
      model.value = profile.model;
      model.placeholder = p.modelHint;
      effortRow.hidden = p.kind !== 'anthropic';
    };
    const keep = (): void => {
      const id = providerById(provider.value).id;
      settings.profiles[id] = { apiKey: key.value, model: model.value, baseUrl: baseUrl.value };
    };
    let shown = provider.value;
    provider.addEventListener('change', () => {
      const next = provider.value;
      provider.value = shown;
      keep();
      provider.value = next;
      shown = next;
      show();
    });
    show();
    const form = h(
      'form',
      { class: 'ai-setup' },
      h('label', {}, t('ai.provider'), provider),
      keyRow,
      keyHelp,
      h('label', { class: 'git-row' }, remember, ' ', t('ai.remember')),
      urlRow,
      h('label', {}, t('ai.model'), model),
      effortRow,
      this.buildMcp(),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('ai.forget'), () => {
          forgetApiKey();
          forgetMcpTokens();
          this.mcp.clear();
          settings = loadAiSettings();
          remember.checked = false;
          show();
        }),
        h('button', { type: 'submit', class: 'primary' }, t('ai.saveSettings')),
      ),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      keep();
      settings = { ...settings, provider: providerById(provider.value).id, remember: remember.checked, effort: effort.value as Effort };
      saveAiSettings(settings);
      settings = loadAiSettings();
      show();
      this.refreshInfo();
      if (ready(settings)) {
        form.hidden = true;
        this.input.focus();
      }
    });
    return form;
  }

  private entry(role: 'user' | 'assistant' | 'action' | 'error' | 'note', text = ''): HTMLElement {
    const el = h('div', { class: `ai-msg ${role}` }, text);
    this.log.append(el);
    this.log.scrollTop = this.log.scrollHeight;
    return el;
  }

  private async send(): Promise<void> {
    const prompt = this.input.value.trim();
    if (!prompt || this.controller) return;
    const settings = loadAiSettings();
    const provider = providerById(settings.provider);
    const profile = activeProfile(settings);
    if (!ready(settings)) {
      this.setup.hidden = false;
      this.focus();
      return;
    }
    const ctx = this.host.context();
    if (!ctx) {
      this.entry('note', t('ai.noDocument'));
      return;
    }
    // AI-002: explicit consent before any content leaves the device.
    if (!hasConsent(settings)) {
      const where = provider.editableUrl ? `${provider.label} — ${hostOf(profile.baseUrl)}` : provider.label;
      if (!(await this.host.confirm(t('ai.consentTitle'), t('ai.consentMessage', { provider: where, model: profile.model })))) return;
      giveConsent(settings);
    }
    // Each provider has its own conversation format: start afresh after a switch.
    if (this.historyProvider !== provider.id) {
      this.history = [];
      this.historyProvider = provider.id;
    }
    this.input.value = '';
    this.entry('user', prompt);
    const undo = await this.host.snapshot();
    const controller = new AbortController();
    this.controller = controller;
    this.sendButton.disabled = true;
    this.stopButton.hidden = false;
    let answer: HTMLElement | null = null;
    // UI-019: turning while the assistant prepares its answer, and again after each of its actions.
    const thinking = h('div', { class: 'ai-msg note', role: 'status' }, ...busyText(t('ai.thinking')));
    const think = (on: boolean): void => {
      if (!on) return thinking.remove();
      this.log.append(thinking);
      this.log.scrollTop = this.log.scrollHeight;
    };
    think(true);
    try {
      const common = {
        system: systemPrompt(ctx.kind, ctx.name, getLocale()),
        tools: [...ctx.tools, ...(await this.mcpTools())],
        prompt,
        signal: controller.signal,
        onText: (delta: string) => {
          think(false);
          answer ??= this.entry('assistant');
          answer.textContent += delta;
          this.log.scrollTop = this.log.scrollHeight;
        },
        onAction: (action: { name: string; input: unknown; ok: boolean; result: string }) => {
          answer = null;
          this.entry('action', `${action.ok ? '✓' : '✗'} ${action.name} ${summarize(action.input)} — ${action.result.split('\n')[0]}`);
          think(true);
        },
      };
      let result: { history: unknown[]; changed: boolean; stop: string };
      if (provider.kind === 'anthropic') {
        const stream = await createStreamFactory(profile.apiKey);
        result = await runAgent({ ...common, stream, model: profile.model, effort: settings.effort, history: this.history as BetaMessageParam[] });
      } else {
        const { runOpenAiAgent } = await import('./openai-agent');
        result = await runOpenAiAgent({ ...common, baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.model, history: this.history });
      }
      this.history = result.history;
      const notes: Record<string, string> = { refusal: t('ai.refusal'), max_tokens: t('ai.truncated'), turn_limit: t('ai.turnLimit'), aborted: t('ai.stopped') };
      if (notes[result.stop]) this.entry('note', notes[result.stop]);
      if (result.changed) this.offerUndo(undo);
    } catch (err) {
      this.entry('error', await this.describeError(err));
    } finally {
      think(false);
      this.controller = null;
      this.sendButton.disabled = false;
      this.stopButton.hidden = true;
    }
  }

  private offerUndo(undo: () => Promise<void>): void {
    const holder = this.entry('note');
    const b = button(t('ai.undo'), () => {
      b.disabled = true;
      void undo().then(() => holder.replaceChildren(t('ai.undone')));
    });
    holder.append(b);
  }

  private async describeError(err: unknown): Promise<string> {
    const { OpenAiError } = await import('./openai-agent');
    if (err instanceof OpenAiError) {
      const byStatus: Record<number, string> = { 0: t('ai.error.unreachable'), 401: t('ai.error.auth'), 403: t('ai.error.permission'), 404: t('ai.error.model'), 429: t('ai.error.rateLimit') };
      return byStatus[err.status] ?? t('ai.error.api', { message: err.message });
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    if (err instanceof Anthropic.AuthenticationError) return t('ai.error.auth');
    if (err instanceof Anthropic.PermissionDeniedError) return t('ai.error.permission');
    if (err instanceof Anthropic.RateLimitError) return t('ai.error.rateLimit');
    if (err instanceof Anthropic.NotFoundError) return t('ai.error.model');
    if (err instanceof Anthropic.APIConnectionError) return t('ai.error.network');
    if (err instanceof Anthropic.APIError) return t('ai.error.api', { message: err.message });
    return t('ai.error.api', { message: (err as Error).message });
  }
}

/** Enough settings to talk to the selected provider. */
function ready(settings: AiSettings): boolean {
  const provider = providerById(settings.provider);
  const profile = activeProfile(settings);
  return !!profile.model && !!profile.baseUrl && (!provider.needsKey || !!profile.apiKey);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
