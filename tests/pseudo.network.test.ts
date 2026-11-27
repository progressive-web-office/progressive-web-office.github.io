import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_OPTIONS, pseudonymiseFiles, reidentifyFile } from '../src/pseudo/pipeline';
import { docxFixture, odpFixture, odsFixture, odtFixture, pptxFixture, textFixtures, xlsxFixture } from './pseudo-fixtures';

const allFixturesSync = () => [docxFixture(), odtFixture(), odsFixture(), odpFixture(), xlsxFixture(), pptxFixture(), ...textFixtures()];
import { PEOPLE_WITH_PSEUDONYMS as people } from './pseudo-fixtures';

const NETWORK = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection', 'sendBeacon'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('PSEUDO-003 no network', () => {
  it('the pseudonymisation code names no network API and imports nothing that reaches the network', () => {
    const banned = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection|sendBeacon)\b/;
    const modules = /from '\.\.\/(\.\.\/)?(ai|collab|git|webdav|share|grist|devsync|backup|sync)\//;
    const sources = files('src/pseudo').filter((f) => f.endsWith('.ts'));
    expect(sources.length).toBeGreaterThan(8);
    for (const f of sources) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, f).not.toMatch(banned);
      expect(code, f).not.toMatch(modules);
    }
  });

  const spies: Record<string, ReturnType<typeof vi.fn>> = {};
  const saved: Record<string, unknown> = {};
  beforeEach(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const name of NETWORK) {
      saved[name] = g[name];
      spies[name] = vi.fn(() => {
        throw new Error(`network: ${name}`);
      });
      g[name] = spies[name];
    }
    saved.beacon = navigator.sendBeacon;
    (navigator as unknown as { sendBeacon: unknown }).sendBeacon = spies.sendBeacon;
  });
  afterEach(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const name of NETWORK) g[name] = saved[name];
    (navigator as unknown as { sendBeacon: unknown }).sendBeacon = saved.beacon;
  });

  it('pseudonymises, checks and re-identifies every test set without a network call', async () => {
    const report = await pseudonymiseFiles(allFixturesSync().map((f) => ({ name: f.name, read: async () => f.bytes })), { people, options: DEFAULT_OPTIONS });
    expect(report.files.every((f) => f.status !== 'refused')).toBe(true);
    const docx = report.files.find((f) => f.source.endsWith('.docx'))!;
    await reidentifyFile('back.docx', docx.outputBytes!, people, 'ETU-');
    for (const name of NETWORK) expect(spies[name], name).not.toHaveBeenCalled();
  });
});
