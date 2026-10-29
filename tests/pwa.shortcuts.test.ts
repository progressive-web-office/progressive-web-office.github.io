import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../src/app/app';
import { openNewFromShortcut } from '../src/app/shortcuts';

const appSpy = () => {
  const newDocument = vi.fn(async () => {});
  return { app: { newDocument } as unknown as App, newDocument };
};

afterEach(() => history.replaceState(null, '', '/'));

describe('PLT-009 app shortcuts', () => {
  it.each(['document', 'spreadsheet', 'presentation'])('starts a new %s and clears the parameter', async (kind) => {
    history.replaceState(null, '', `/?new=${kind}&x=1#top`);
    const { app, newDocument } = appSpy();
    await openNewFromShortcut(app);
    expect(newDocument).toHaveBeenCalledWith(kind);
    expect(location.search).toBe('?x=1');
    expect(location.hash).toBe('#top');
  });

  it('ignores an unknown kind but still clears the parameter', async () => {
    history.replaceState(null, '', '/?new=pdf');
    const { app, newDocument } = appSpy();
    await openNewFromShortcut(app);
    expect(newDocument).not.toHaveBeenCalled();
    expect(location.search).toBe('');
  });

  it('does nothing without the parameter', async () => {
    const { app, newDocument } = appSpy();
    await openNewFromShortcut(app);
    expect(newDocument).not.toHaveBeenCalled();
  });
});
