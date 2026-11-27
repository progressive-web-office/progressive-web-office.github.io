import { expect, test, type Route } from '@playwright/test';
import { openApp } from './helpers';

const API = 'https://api.github.com';
const b64 = (s: string) => Buffer.from(s).toString('base64');

test('opens a file from GitHub, commits it and handles a conflict (GIT-001..GIT-004)', async ({ page }) => {
  const errors = await openApp(page);
  const puts: { url: string; body: Record<string, string>; auth: string | undefined }[] = [];
  let conflictOnce = false;
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const p = url.pathname;
    if (req.method() === 'GET' && p === '/user/repos') return json([{ full_name: 'me/notes', default_branch: 'main', private: true }]);
    if (req.method() === 'GET' && p === '/repos/me/notes/branches') return json([{ name: 'main' }]);
    if (req.method() === 'GET' && p === '/repos/me/notes/contents') return json([{ name: 'notes.md', path: 'notes.md', type: 'file', size: 8 }, { name: 'img.bin', path: 'img.bin', type: 'file', size: 1 }]);
    if (req.method() === 'GET' && p === '/repos/me/notes/contents/notes.md') return json({ type: 'file', sha: url.searchParams.get('ref') === 'main' ? 's1' : 's3', content: b64('# Notes\n'), encoding: 'base64' });
    if (req.method() === 'GET' && p.startsWith('/repos/me/notes/git/trees/')) return json({ tree: [{ path: 'notes.md', type: 'blob', sha: 's1', size: 8 }, { path: 'img.bin', type: 'blob', sha: 'i', size: 1 }], truncated: false });
    if (req.method() === 'GET' && p === '/repos/me/notes/git/ref/heads/main') return json({ object: { sha: 'c0' } });
    if (req.method() === 'POST' && p === '/repos/me/notes/git/refs') return json({}, 201);
    if (req.method() === 'PUT' && p === '/repos/me/notes/contents/notes.md') {
      const body = JSON.parse(req.postData() ?? '{}') as Record<string, string>;
      puts.push({ url: req.url(), body, auth: req.headers().authorization });
      if (conflictOnce) {
        conflictOnce = false;
        return json({ message: 'notes.md does not match s2' }, 409);
      }
      return json({ content: { sha: `s${puts.length + 1}` }, commit: { sha: 'c1' } });
    }
    return json({ message: 'Not Found' }, 404);
  });

  await page.getByRole('button', { name: 'Open from repository…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Open from repository' });
  await expect(dialog.getByText('A token is needed only for a private repository')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add account' }).click();
  await dialog.getByLabel('Personal access token').fill('ghp_test');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await dialog.getByLabel('Repository', { exact: true }).selectOption({ label: 'me/notes' });
  await expect(dialog.getByRole('button', { name: '📄 img.bin' })).toBeDisabled();
  await dialog.getByRole('button', { name: '📄 notes.md' }).click();

  await expect(page.locator('.doc-page h1')).toHaveText('Notes');
  await expect(page.locator('.doc-source')).toHaveText(/me\/notes · main/);
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('More text');

  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const commit = page.getByRole('dialog', { name: 'Commit to the repository' });
  await expect(commit.getByLabel('Commit message')).toHaveValue('docs: update notes.md');
  await commit.getByRole('button', { name: 'Commit' }).click();
  await expect(page.getByRole('alert')).toContainText('Committed notes.md to main.');
  expect(puts[0]!.body).toMatchObject({ message: 'docs: update notes.md', branch: 'main', sha: 's1' });
  expect(Buffer.from(puts[0]!.body.content!, 'base64').toString()).toBe('# Notes\n\nMore text\n');
  expect(puts[0]!.auth).toBe('Bearer ghp_test');

  // GIT-004: someone else committed meanwhile.
  conflictOnce = true;
  await editor.click();
  await page.keyboard.type(' again');
  await page.keyboard.press('Control+S');
  await page.getByRole('dialog', { name: 'Commit to the repository' }).getByRole('button', { name: 'Commit' }).click();
  const conflict = page.getByRole('dialog', { name: 'The file changed in the repository' });
  await conflict.getByLabel('Save on a new branch').check();
  await conflict.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText(/Committed notes\.md to pwo\//);
  expect(puts[1]!.body.sha).toBe('s2');
  expect(puts[2]!.body.branch).toMatch(/^pwo\//);
  expect(puts[2]!.body.sha).toBe('s3');
  await expect(page.locator('.doc-source')).toContainText('me/notes · pwo/');
  // The browser logs the (expected) 409 response itself.
  expect(errors.filter((e) => !e.includes('409'))).toEqual([]);
});

test('opens a repository as a folder, each change being a commit (FOLDER-007)', async ({ page }) => {
  // A repository in memory behind the GitHub API: files by path, commits applied to them.
  const files = new Map<string, string>([['README.md', '# Notes\n'], ['docs/plan.md', '# Plan\n']]);
  const blobs = new Map<string, string>();
  const sha = (text: string) => `b${Buffer.from(text).toString('hex').slice(0, 12)}${text.length}`;
  const commits: string[] = [];
  let head = 'c0';
  await page.addInitScript(() => {
    localStorage.setItem('pwo.git.accounts', JSON.stringify([{ id: 'gh1', provider: 'github', apiUrl: 'https://api.github.com', token: 'ghp_x', label: 'me' }]));
  });
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const body = () => JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    if (p === '/user/repos') return json([{ full_name: 'me/notes', default_branch: 'main' }]);
    if (p === '/repos/me/notes/branches') return json([{ name: 'main' }]);
    if (p === '/repos/me/notes/git/trees/main') {
      const dirs = new Set<string>();
      for (const f of files.keys()) f.split('/').slice(0, -1).forEach((_, i, a) => dirs.add(a.slice(0, i + 1).join('/')));
      return json({ tree: [...[...dirs].map((d) => ({ path: d, type: 'tree', sha: `t-${d}` })), ...[...files].map(([path, text]) => ({ path, type: 'blob', sha: sha(text), size: text.length }))], truncated: false });
    }
    if (p.startsWith('/repos/me/notes/contents/')) {
      const path = decodeURIComponent(p.slice('/repos/me/notes/contents/'.length));
      const text = files.get(path);
      return text === undefined ? json({ message: 'Not Found' }, 404) : json({ type: 'file', sha: sha(text), content: b64(text), encoding: 'base64' });
    }
    if (p === '/repos/me/notes/git/ref/heads/main') return json({ object: { sha: head } });
    if (p.startsWith('/repos/me/notes/git/commits/') && req.method() === 'GET') return json({ tree: { sha: `tree-${head}` } });
    if (p === '/repos/me/notes/git/blobs') {
      const text = Buffer.from(String(body().content), 'base64').toString();
      blobs.set(sha(text), text);
      return json({ sha: sha(text) }, 201);
    }
    if (p === '/repos/me/notes/git/trees' && req.method() === 'POST') {
      for (const e of body().tree as { path: string; sha: string | null }[]) {
        if (e.sha === null) files.delete(e.path);
        else files.set(e.path, blobs.get(e.sha) ?? [...files.values()].find((t) => sha(t) === e.sha) ?? '');
      }
      return json({ sha: 'newtree' }, 201);
    }
    if (p === '/repos/me/notes/git/commits') {
      commits.push(String(body().message));
      return json({ sha: `c${commits.length}` }, 201);
    }
    if (p === '/repos/me/notes/git/refs/heads/main') {
      head = String(body().sha);
      return json({});
    }
    return json({ message: 'Not Found' }, 404);
  });
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const where = page.getByRole('dialog', { name: 'Open a folder' });
  await where.getByLabel('⎇ me (GitHub)').check();
  await where.getByRole('button', { name: 'Open' }).click();
  const pick = page.getByRole('dialog', { name: 'Open a repository' });
  await pick.getByLabel('me/notes').check();
  await pick.getByRole('button', { name: 'Open' }).click();
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 me/notes (main)' })).toBeVisible();
  await expect(panel.locator('.fs-root + .fs-list > li > .fs-entry')).toHaveText(['docs', 'README.md']);

  // Saving a document of the repository is a commit.
  await panel.getByRole('button', { name: 'README.md' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Notes');
  await page.locator('.doc-page h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' and plans');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => files.get('README.md')).toContain('# Notes and plans\n');
  // The tree is written before the commit is: wait for both.
  await expect.poll(() => commits).toEqual(['docs: update README.md']);

  // Renaming in the explorer is a commit too.
  await panel.getByRole('button', { name: 'docs' }).click();
  await panel.getByRole('button', { name: 'plan.md' }).click({ button: 'right' });
  page.once('dialog', (d) => void d.accept('roadmap.md'));
  await page.getByRole('menu').getByRole('menuitem', { name: 'Rename (F2)' }).click();
  await expect.poll(() => [...files.keys()].sort()).toEqual(['README.md', 'docs/roadmap.md']);
  await expect.poll(() => commits.at(-1)).toBe('docs: rename docs/plan.md to docs/roadmap.md');

  // GIT-015: a new text document made right in the repository, opened at once.
  page.once('dialog', (d) => void d.accept('Report.odt'));
  await panel.getByRole('button', { name: 'New document (.odt)' }).click();
  await expect.poll(() => [...files.keys()].find((f) => f.endsWith('Report.odt'))).toBeTruthy();
  await expect.poll(() => commits.at(-1)).toMatch(/Report\.odt/);
  await expect(page.locator('.doc-page')).toBeVisible();
  expect(errors).toEqual([]);
});

test('starts a branch of a repository opened as a folder and proposes its changes (FOLDER-022)', async ({ page }) => {
  const files = new Map<string, string>([['README.md', '# Notes\n']]);
  const branches = new Map<string, string>([['main', 'c0']]);
  const pulls: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('pwo.git.accounts', JSON.stringify([{ id: 'gh1', provider: 'github', apiUrl: 'https://api.github.com', token: 'ghp_x', label: 'me' }]));
  });
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const body = () => JSON.parse(req.postData() ?? '{}') as Record<string, string>;
    if (p === '/user/repos') return json([{ full_name: 'me/notes', default_branch: 'main' }]);
    if (p === '/repos/me/notes/branches') return json([...branches.keys()].map((name) => ({ name })));
    if (p.startsWith('/repos/me/notes/git/trees/')) return json({ tree: [...files].map(([path, text]) => ({ path, type: 'blob', sha: `s${text.length}`, size: text.length })), truncated: false });
    if (p.startsWith('/repos/me/notes/git/ref/heads/')) return json({ object: { sha: branches.get(decodeURIComponent(p.slice('/repos/me/notes/git/ref/heads/'.length))) } });
    if (p === '/repos/me/notes/git/refs' && req.method() === 'POST') {
      branches.set(body().ref!.replace('refs/heads/', ''), body().sha!);
      return json({}, 201);
    }
    if (p === '/repos/me/notes/pulls' && req.method() === 'POST') {
      pulls.push(body());
      return json({ number: 7, html_url: 'https://github.com/me/notes/pull/7' }, 201);
    }
    return json({ message: 'Not Found' }, 404);
  });
  await page.context().route('https://github.com/**', (route) => route.fulfill({ body: 'PR' }));
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const where = page.getByRole('dialog', { name: 'Open a folder' });
  await where.getByLabel('⎇ me (GitHub)').check();
  await where.getByRole('button', { name: 'Open' }).click();
  const pick = page.getByRole('dialog', { name: 'Open a repository' });
  await pick.getByLabel('me/notes').check();
  await pick.getByRole('button', { name: 'Open' }).click();
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 me/notes (main)' })).toBeVisible();

  // A new branch, started from main; the folder is now that branch.
  await panel.getByRole('button', { name: 'Branches and pull requests' }).click();
  const menu = page.getByRole('dialog', { name: 'Branches and pull requests' });
  await expect(menu.getByLabel(/Propose the changes/)).toHaveCount(0);
  await menu.getByLabel('Work on a new branch…').check();
  page.once('dialog', (d) => void d.accept('draft'));
  await menu.getByRole('button', { name: 'Continue' }).click();
  await expect(panel.getByRole('heading', { name: '📁 me/notes (draft)' })).toBeVisible();
  expect(branches.get('draft')).toBe('c0');

  // Propose its changes to main.
  await panel.getByRole('button', { name: 'Branches and pull requests' }).click();
  await menu.getByLabel('Propose the changes to main (pull request)…').check();
  const popup = page.waitForEvent('popup');
  page.once('dialog', (d) => void d.accept('Plan of the thesis'));
  await menu.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Request #7 opened');
  expect(pulls).toEqual([{ head: 'draft', base: 'main', title: 'Plan of the thesis', body: '' }]);
  const opened = await popup;
  await opened.waitForLoadState();
  expect(opened.url()).toBe('https://github.com/me/notes/pull/7');
  await opened.close();

  // Back to main.
  await panel.getByRole('button', { name: 'Branches and pull requests' }).click();
  await menu.getByLabel('Open another branch').check();
  await menu.getByRole('button', { name: 'Continue' }).click();
  const choose = page.getByRole('dialog', { name: 'Open another branch' });
  await choose.getByLabel('main').check();
  await choose.getByRole('button', { name: 'Open' }).click();
  await expect(panel.getByRole('heading', { name: '📁 me/notes (main)' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a pasted address is understood at once; a public repository opens without a token (GIT-008)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await openApp(page);
  const auth: (string | undefined)[] = [];
  await page.route(`${API}/**`, async (route: Route) => {
    const p = new URL(route.request().url()).pathname;
    auth.push(route.request().headers().authorization);
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/repos/s-celles/test-pwo-public') return json({ full_name: 's-celles/test-pwo-public', default_branch: 'main', private: false });
    if (p === '/repos/s-celles/test-pwo-public/branches') return json([{ name: 'main' }]);
    if (p === '/repos/s-celles/test-pwo-public/contents') return json([{ name: 'README.md', path: 'README.md', type: 'file', size: 9 }]);
    if (p === '/repos/s-celles/test-pwo-public/contents/README.md' && route.request().method() === 'PUT') return json({ content: { sha: 's2' } }, 200);
    if (p === '/repos/s-celles/test-pwo-public/contents/README.md') return json({ type: 'file', sha: 's1', content: b64('# Public\n'), encoding: 'base64' });
    return json({ message: 'Not Found' }, 404);
  });
  await page.getByRole('button', { name: 'Open from repository…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Open from repository' });
  await page.evaluate(() => navigator.clipboard.writeText('https://github.com/s-celles/test-pwo-public'));
  await dialog.getByLabel('Repository address').focus();
  await page.keyboard.press('Control+V');
  // Understood without pressing Go: the service, the owner, the repository.
  await expect(dialog.locator('.git-understood')).toHaveText('✓ GitHub (github.com) · owner s-celles · repository test-pwo-public');
  await expect(dialog.getByLabel('Other repository (owner/name)')).toHaveValue('s-celles/test-pwo-public');
  await expect(dialog.getByText('Public repository opened without a token')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '🔑 Add a token to save here' })).toBeVisible();
  await dialog.getByRole('button', { name: '📄 README.md' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Public');
  expect(auth.every((a) => a === undefined)).toBe(true);
  // Saving into it needs a token: asked then, checked on the repository and remembered (GIT-012).
  await page.locator('.doc-page h1').click();
  await page.keyboard.type('!');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const ask = page.getByRole('dialog', { name: 'A token to save in the repository' });
  await expect(ask.getByText('s-celles/test-pwo-public was opened without a token')).toBeVisible();
  await expect(ask.getByRole('link', { name: 'https://github.com/settings/personal-access-tokens/new' })).toBeVisible();
  await expect(ask.getByLabel('Remember the token in this browser')).toBeChecked();
  await ask.getByLabel('Personal access token').fill('github_pat_test');
  await ask.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('dialog', { name: 'Commit to the repository' }).getByRole('button', { name: 'Commit' }).click();
  await expect(page.getByRole('alert')).toContainText('Committed README.md to main.');
  expect(auth.at(-1)).toBe('Bearer github_pat_test');
  expect(await page.evaluate(() => localStorage.getItem('pwo.git.accounts'))).toContain('github_pat_test');
  // Next time, the repository opens with the token remembered.
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Open from repository…' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Open from repository' }).getByLabel('Account')).toContainText('GitHub — github.com');
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

test('a private repository asks for a token, the account form filled in (GIT-008, GIT-009)', async ({ page }) => {
  const errors = await openApp(page);
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    // Private: unknown without the token.
    if (req.headers().authorization !== 'Bearer ghp_test') return json({ message: 'Not Found' }, 404);
    if (p === '/user/repos') return json([]);
    if (p === '/repos/s-celles/test-pwo-private') return json({ full_name: 's-celles/test-pwo-private', default_branch: 'main', private: true });
    if (p === '/repos/s-celles/test-pwo-private/branches') return json([{ name: 'main' }, { name: 'dev' }]);
    if (p === '/repos/s-celles/test-pwo-private/contents/docs') return json([{ name: 'plan.md', path: 'docs/plan.md', type: 'file', size: 7 }]);
    if (p === '/repos/s-celles/test-pwo-private/contents/docs/plan.md') return json({ type: 'file', sha: 's1', content: b64('# Plan\n'), encoding: 'base64' });
    return json({ message: 'Not Found' }, 404);
  });
  await page.getByRole('button', { name: 'Open from repository…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Open from repository' });
  await dialog.getByLabel('Repository address').fill('https://github.com/s-celles/test-pwo-private/blob/dev/docs/plan.md');
  await expect(dialog.locator('.git-understood')).toContainText('repository test-pwo-private · Branch dev · docs/plan.md');
  await expect(dialog.getByText('s-celles/test-pwo-private is private, or does not exist')).toBeVisible();
  await expect(dialog.getByLabel('Provider')).toHaveValue('github');
  await expect(dialog.getByLabel('API URL')).toHaveValue('https://api.github.com');
  // GIT-009: how to make the token, with the page to make it.
  await dialog.getByText('How to create a token?').click();
  await expect(dialog.getByRole('link', { name: 'https://github.com/settings/personal-access-tokens/new' })).toBeVisible();
  await dialog.getByLabel('Personal access token').fill('ghp_test');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Plan');
  await expect(page.locator('.doc-source')).toHaveText('🔒 s-celles/test-pwo-private · dev');
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

test('proposes a text format when saving to a repository (GIT-010)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pwo.git.accounts', JSON.stringify([{ id: 'gh1', provider: 'github', apiUrl: 'https://api.github.com', token: 'ghp_x', label: 'me' }]));
  });
  await openApp(page);
  await page.route(`${API}/**`, (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.getByRole('button', { name: 'New document' }).first().click();
  await page.getByRole('button', { name: 'Commit…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Save to repository' });
  await expect(dialog.getByLabel('File name')).toHaveValue(/\.md$/);
  await expect(dialog.getByText('A text format: Git shows what changed')).toBeVisible();
  await dialog.getByLabel('Format').selectOption('docx');
  await expect(dialog.getByLabel('File name')).toHaveValue(/\.docx$/);
  await expect(dialog.getByText(/binary file.*prefer \.md/)).toBeVisible();
});

test('opens a repository as a folder from its address (FOLDER-007, GIT-008)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pwo.git.accounts', JSON.stringify([{ id: 'gh1', provider: 'github', apiUrl: 'https://api.github.com', token: 'ghp_x', label: 'me' }]));
  });
  await page.route(`${API}/**`, async (route: Route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/user/repos') return json([]);
    if (p === '/repos/s-celles/test-pwo') return json({ full_name: 's-celles/test-pwo', default_branch: 'main' });
    if (p === '/repos/s-celles/test-pwo/branches') return json([{ name: 'main' }, { name: 'dev' }]);
    if (p === '/repos/s-celles/test-pwo/contents') return json([{ name: 'README.md', path: 'README.md', type: 'file', size: 8 }]);
    if (p === '/repos/s-celles/test-pwo/git/trees/dev') return json({ tree: [{ path: 'README.md', type: 'blob', sha: 'b1', size: 8 }], truncated: false });
    return json({ message: 'Not Found' }, 404);
  });
  await openApp(page);
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const where = page.getByRole('dialog', { name: 'Open a folder' });
  await where.getByLabel('⎇ GitHub / GitLab repository…').check();
  await where.getByRole('button', { name: 'Open' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a repository as a folder' });
  await dialog.getByLabel('Repository address').fill('https://github.com/s-celles/test-pwo/tree/dev');
  await dialog.getByLabel('Repository address').press('Enter');
  await expect(dialog.getByLabel('Branch')).toHaveValue('dev');
  await dialog.getByRole('button', { name: 'Open as folder' }).click();
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 s-celles/test-pwo (dev)' })).toBeVisible();
});

test('starts a branch and proposes its changes from a document of a repository (GIT-007)', async ({ page }) => {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('pwo.git.accounts', JSON.stringify([{ id: 'gh1', provider: 'github', apiUrl: 'https://api.github.com', token: 'ghp_x', label: 'me' }]));
  });
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'POST') posts.push({ path: p, body: JSON.parse(req.postData() ?? '{}') as Record<string, unknown> });
    if (p === '/user/repos') return json([{ full_name: 'me/notes', default_branch: 'main' }]);
    if (p === '/repos/me/notes/branches') return json([{ name: 'main' }]);
    if (p === '/repos/me/notes/contents') return json([{ name: 'notes.md', path: 'notes.md', type: 'file', size: 8 }]);
    if (p === '/repos/me/notes/contents/notes.md') return json({ type: 'file', sha: 's1', content: b64('# Notes\n'), encoding: 'base64' });
    if (p.startsWith('/repos/me/notes/git/trees/') && req.method() === 'GET') return json({ tree: [{ path: 'notes.md', type: 'blob', sha: 's1', size: 8 }], truncated: false });
    if (p === '/repos/me/notes/git/ref/heads/main') return json({ object: { sha: 'c0' } });
    if (p === '/repos/me/notes/git/refs') return json({}, 201);
    if (p === '/repos/me/notes/pulls') return json({ number: 7, html_url: 'https://github.com/me/notes/pull/7' }, 201);
    return json({ message: 'Not Found' }, 404);
  });
  await openApp(page);
  await page.getByRole('button', { name: 'Open from repository…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Open from repository' });
  await dialog.getByLabel('Repository', { exact: true }).selectOption({ label: 'me/notes' });
  await dialog.getByRole('button', { name: '📄 notes.md' }).click();

  const source = page.locator('.doc-source');
  await expect(source).toHaveText('🌐 me/notes · main');
  page.once('dialog', (d) => void d.accept('draft'));
  await source.click();
  await page.getByRole('dialog', { name: 'Branches and pull requests' }).getByRole('button', { name: 'Continue' }).click();
  await expect(source).toHaveText('🌐 me/notes · draft');
  expect(posts[0]).toMatchObject({ path: '/repos/me/notes/git/refs', body: { ref: 'refs/heads/draft', sha: 'c0' } });

  const popup = page.waitForEvent('popup');
  page.once('dialog', (d) => void d.accept('My changes'));
  await source.click();
  const menu = page.getByRole('dialog', { name: 'Branches and pull requests' });
  await expect(menu.getByLabel('Propose the changes to main (pull request)…')).toBeChecked();
  await menu.getByRole('button', { name: 'Continue' }).click();
  await popup;
  expect(posts[1]).toMatchObject({ path: '/repos/me/notes/pulls', body: { head: 'draft', base: 'main', title: 'My changes' } });
  await expect(page.getByRole('alert')).toContainText('Request #7 opened');
});

test('saves the first document of an empty repository, just created (GIT-011)', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => localStorage.setItem('pwo.git.accounts', JSON.stringify([{ id: 'gh', provider: 'github', apiUrl: 'https://api.github.com', token: 'ghp_test', label: 'me' }])));
  const puts: Record<string, string>[] = [];
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/user/repos') return json([]);
    if (p === '/repos/s-celles/empty') return json({ full_name: 's-celles/empty', default_branch: 'main', private: true });
    if (p === '/repos/s-celles/empty/branches') return json([]);
    if (p.startsWith('/repos/s-celles/empty/contents') && req.method() === 'PUT') {
      const body = req.postDataJSON() as Record<string, string>;
      puts.push(body);
      // GitHub: no branch yet in an empty repository.
      if (body.branch) return json({ message: 'Branch main not found' }, 404);
      return json({ content: { sha: 'first' } }, 201);
    }
    return json({ message: 'This repository is empty.' }, 404);
  });
  await page.getByRole('button', { name: 'New document' }).first().click();
  await page.locator('.doc-page').click();
  await page.keyboard.type('First words');
  await page.locator('.header-actions').getByRole('button', { name: 'Commit…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save to repository' });
  await dialog.getByLabel('Repository address').fill('https://github.com/s-celles/empty');
  await expect(dialog.getByText('This repository is empty: your document will be its first file')).toBeVisible();
  await expect(dialog.locator('.git-status')).not.toHaveClass(/error/);
  await dialog.getByRole('button', { name: 'Save here' }).click();
  await page.getByRole('dialog', { name: 'Commit to the repository' }).getByRole('button', { name: 'Commit' }).click();
  await expect(page.getByRole('alert')).toContainText('to main.');
  expect(puts.map((b) => b.branch)).toEqual(['main', undefined]);
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

test('another repository never shows the files of the one before, and tells who can see it (GIT-013)', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => localStorage.setItem('pwo.git.accounts', JSON.stringify([{ id: 'gh', provider: 'github', apiUrl: 'https://api.github.com', token: 'ghp_test', label: 'github.com' }])));
  await page.route(`${API}/**`, async (route: Route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/user/repos') return json([]);
    if (p === '/repos/s-celles/test-pwo-public') return json({ full_name: 's-celles/test-pwo-public', default_branch: 'main', private: false, visibility: 'public', permissions: { admin: true, push: true, pull: true } });
    if (p === '/repos/s-celles/test-pwo-public/branches') return json([{ name: 'main' }]);
    if (p === '/repos/s-celles/test-pwo-public/contents') return json([{ name: 'Lettre.md', path: 'Lettre.md', type: 'file', size: 9 }, { name: 'README.md', path: 'README.md', type: 'file', size: 9 }]);
    if (p === '/repos/s-celles/test-pwo-public/git/trees/main') return json({ tree: [{ path: 'Lettre.md', type: 'blob', sha: 'a', size: 9 }, { path: 'README.md', type: 'blob', sha: 'b', size: 9 }], truncated: false });
    if (p === '/repos/s-celles/test-pwo-public/collaborators') return json([{ login: 's-celles', role_name: 'admin' }, { login: 'ann', role_name: 'read' }]);
    if (p === '/repos/s-celles/broken') return json({ full_name: 's-celles/broken', default_branch: 'main', private: true, visibility: 'private', permissions: { pull: true } });
    if (p === '/repos/s-celles/broken/branches') return json({ message: 'Server Error' }, 500);
    return json({ message: 'Not Found' }, 404);
  });
  await page.getByRole('button', { name: 'Open from repository…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Open from repository' });
  await dialog.getByLabel('Repository address').fill('https://github.com/s-celles/test-pwo-public');
  await expect(dialog.getByRole('button', { name: '📄 Lettre.md' })).toBeVisible();
  // Who can see it, the role of the account, the collaborators.
  await expect(dialog.locator('.git-visibility')).toHaveText('🌐 Public');
  await expect(dialog.getByText('Your role: Admin')).toBeVisible();
  await dialog.getByText('Collaborators and their roles').click();
  await expect(dialog.locator('.git-people li')).toHaveText(['s-celles — Admin', 'ann — Read · cannot save']);
  // Another repository that fails to load: nothing of the first one stays.
  await dialog.getByLabel('Repository address').fill('https://github.com/s-celles/broken');
  await expect(dialog.locator('.git-status')).toHaveClass(/error/);
  await expect(dialog.locator('.git-list li')).toHaveCount(0);
  await expect(dialog.locator('.git-crumbs')).toBeEmpty();
  await expect(dialog.getByRole('button', { name: '📁 Open the repository as a folder' })).toBeHidden();
  // A repository opened shows its tree as a folder.
  await dialog.getByLabel('Repository address').fill('https://github.com/s-celles/test-pwo-public');
  await dialog.getByRole('button', { name: '📁 Open the repository as a folder' }).click();
  const panel = page.locator('.folder-panel');
  await expect(panel.getByText('Lettre.md')).toBeVisible();
  await expect(panel.getByText('README.md')).toBeVisible();
  await panel.getByRole('button', { name: 'Visibility and collaborators' }).click();
  await expect(page.getByRole('dialog', { name: /Visibility and collaborators/ }).locator('.git-visibility')).toHaveText('🌐 Public');
  expect(errors.filter((e) => !/404|500/.test(e))).toEqual([]);
});

test('shows the history of a document, what each commit changed, and restores an older version (VER-001..VER-003)', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => localStorage.setItem('pwo.git.accounts', JSON.stringify([{ id: 'gh', provider: 'github', apiUrl: 'https://api.github.com', token: 'ghp_test', label: 'github.com' }])));
  const versions: Record<string, string> = { c3: '# Report\n\nThe results are good.\n', c2: '# Report\n\nThe results are bad.\n', c1: '# Report\n' };
  const puts: Record<string, string>[] = [];
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/user/repos') return json([]);
    if (p === '/repos/me/notes') return json({ full_name: 'me/notes', default_branch: 'main', private: true, visibility: 'private', permissions: { push: true, pull: true } });
    if (p === '/repos/me/notes/branches') return json([{ name: 'main' }]);
    if (p === '/repos/me/notes/contents') return json([{ name: 'report.md', path: 'report.md', type: 'file', size: 30 }]);
    if (p.startsWith('/repos/me/notes/git/trees/')) return json({ tree: [{ path: 'report.md', type: 'blob', sha: 'b3', size: 30 }], truncated: false });
    if (p === '/repos/me/notes/commits') {
      return json([
        { sha: 'c3', commit: { message: 'docs: good results', author: { name: 'Ann', date: '2026-10-03T10:00:00Z' } }, author: { login: 'ann' } },
        { sha: 'c2', commit: { message: 'docs: first results', author: { name: 'Bob', date: '2026-10-02T10:00:00Z' } }, author: null },
        { sha: 'c1', commit: { message: 'docs: add report.md', author: { name: 'Bob', date: '2026-10-01T10:00:00Z' } }, author: null },
      ]);
    }
    if (p === '/repos/me/notes/contents/report.md' && req.method() === 'PUT') {
      puts.push(req.postDataJSON() as Record<string, string>);
      return json({ content: { sha: 'b4' } });
    }
    if (p === '/repos/me/notes/contents/report.md') {
      const ref = url.searchParams.get('ref') ?? 'main';
      const text = versions[ref] ?? versions.c3!;
      return json({ type: 'file', sha: ref === 'main' ? 'b3' : `b-${ref}`, content: b64(text), encoding: 'base64' });
    }
    return json({ message: 'Not Found' }, 404);
  });
  await page.getByRole('button', { name: 'Open from repository…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Open from repository' });
  await dialog.getByLabel('Repository address').fill('https://github.com/me/notes/blob/main/report.md');
  await expect(page.locator('.doc-page h1')).toHaveText('Report');
  // The history, from the repository shown above the document.
  await page.locator('.doc-source').click();
  await page.getByLabel('History of this document…').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  const history = page.getByRole('dialog', { name: 'History of report.md' });
  await expect(history.getByText('3 commits on main.')).toBeVisible();
  await expect(history.locator('.history-list li')).toHaveCount(3);
  await expect(history.locator('.history-list li').first()).toContainText('docs: good results — Ann (@ann)');
  // What the newest commit changed: a word.
  await history.locator('.history-list li').first().getByRole('button', { name: 'Changes made' }).click();
  const diff = page.getByRole('dialog', { name: 'Changes in report.md' });
  await expect(diff.locator('del', { hasText: 'bad' })).toBeVisible();
  await expect(diff.locator('ins', { hasText: 'good' })).toBeVisible();
  await expect(diff.getByText('0 lines added, 0 removed, 1 changed.')).toBeVisible();
  await diff.getByRole('button', { name: 'Close' }).click();
  await history.getByRole('button', { name: 'Close' }).click();
  // Compared with the document as it is now, unsaved changes included.
  await page.locator('.doc-page p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Really.');
  await page.locator('.doc-source').click();
  await page.getByLabel('History of this document…').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await history.locator('.history-list li').first().getByRole('button', { name: 'Compare with now' }).click();
  await expect(diff.locator('ins', { hasText: 'Really' })).toBeVisible();
  await diff.getByRole('button', { name: 'Close' }).click();
  // The oldest version restored: a new commit puts it back (the restore, then the unsaved changes, confirmed).
  const accept = (d: import('@playwright/test').Dialog) => void d.accept();
  page.on('dialog', accept);
  await history.locator('.history-list li').nth(2).getByRole('button', { name: 'Restore…' }).click();
  await expect(page.getByRole('alert')).toContainText('report.md restored as it was on');
  page.off('dialog', accept);
  expect(puts).toHaveLength(1);
  expect(Buffer.from(puts[0]!.content!, 'base64').toString()).toBe('# Report\n');
  expect(puts[0]).toMatchObject({ message: 'docs: restore report.md as of c1', branch: 'main', sha: 'b3' });
  await expect(page.locator('.doc-page p')).toHaveCount(0);
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

test('works with a Forgejo site: Codeberg by its address, then saved with a token (GIT-016)', async ({ page }) => {
  const errors = await openApp(page);
  const CB = 'https://codeberg.org/api/v1';
  const auth: (string | undefined)[] = [];
  const writes: { method: string; body: Record<string, string> }[] = [];
  await page.route(`${CB}/**`, async (route: Route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname.replace('/api/v1', '');
    auth.push(req.headers().authorization);
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/repos/me/notes') return json({ full_name: 'me/notes', default_branch: 'main', private: false, permissions: { push: true, pull: true } });
    if (p === '/repos/me/notes/branches') return json([{ name: 'main' }]);
    if (p === '/repos/me/notes/contents') return json([{ name: 'notes.md', path: 'notes.md', type: 'file', size: 8 }]);
    // The repository shown as a folder beside the file (GIT-013).
    if (p === '/repos/me/notes/branches/main') return json({ name: 'main', commit: { id: 'c1' } });
    if (p === '/repos/me/notes/git/trees/c1') return json({ tree: [{ path: 'notes.md', type: 'blob', sha: 's1', size: 8 }], truncated: false });
    if (p === '/repos/me/notes/contents/notes.md' && req.method() === 'GET') return json({ type: 'file', sha: 's1', content: b64('# Notes\n'), encoding: 'base64' });
    if (p === '/repos/me/notes/contents/notes.md') {
      writes.push({ method: req.method(), body: JSON.parse(req.postData() ?? '{}') as Record<string, string> });
      return json({ content: { sha: 's2' } });
    }
    return json({ message: 'Not Found' }, 404);
  });
  await page.getByRole('button', { name: 'Open from repository…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Open from repository' });
  await dialog.getByLabel('Repository address').fill('https://codeberg.org/me/notes/src/branch/main/notes.md');
  await dialog.getByRole('button', { name: 'Go' }).first().click();
  await expect(page.locator('.doc-page h1')).toHaveText('Notes');
  await page.locator('.doc-page h1').click();
  await page.keyboard.type('!');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const ask = page.getByRole('dialog', { name: 'A token to save in the repository' });
  await expect(ask.getByRole('link', { name: 'https://codeberg.org/user/settings/applications' })).toBeVisible();
  await ask.getByLabel('Personal access token').fill('cb_token');
  await ask.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('dialog', { name: 'Commit to the repository' }).getByRole('button', { name: 'Commit' }).click();
  await expect(page.getByRole('alert')).toContainText('Committed notes.md to main.');
  expect(writes[0]).toMatchObject({ method: 'PUT', body: { branch: 'main', sha: 's1', message: 'docs: update notes.md' } });
  expect(auth.at(-1)).toBe('token cb_token');
  expect(errors).toEqual([]);
});

test('opens each repository with the token that has access to it, among several of the same site (GIT-018)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'pwo.git.accounts',
      JSON.stringify([
        { id: 'gh-docs', provider: 'github', apiUrl: 'https://api.github.com', token: 'pat_docs', label: 'docs' },
        { id: 'gh-site', provider: 'github', apiUrl: 'https://api.github.com', token: 'pat_site', label: 'site' },
      ]),
    );
  });
  const used: string[] = [];
  await page.route(`${API}/**`, async (route: Route) => {
    const p = new URL(route.request().url()).pathname;
    const token = (route.request().headers().authorization ?? '').replace(/^(Bearer|token) /, '');
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    // Each token opens its own repository only (fine-grained tokens).
    const mine = token === 'pat_site' ? 'ada/site' : token === 'pat_docs' ? 'ada/docs' : '';
    if (p === '/user/repos') return json([]);
    if (p.startsWith('/repos/')) used.push(`${token} ${p}`);
    if (p === `/repos/${mine}`) return json({ full_name: mine, default_branch: 'main', private: true, permissions: { pull: true, push: true } });
    if (p === `/repos/${mine}/branches`) return json([{ name: 'main' }]);
    if (p === `/repos/${mine}/git/trees/main`) return json({ tree: [{ path: 'index.md', type: 'blob', sha: 'b1', size: 8 }], truncated: false });
    return json({ message: 'Not Found' }, 404);
  });
  await openApp(page);
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const where = page.getByRole('dialog', { name: 'Open a folder' });
  await where.getByLabel('⎇ GitHub / GitLab repository…').check();
  await where.getByRole('button', { name: 'Open' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a repository as a folder' });
  await dialog.getByLabel('Repository address').fill('https://github.com/ada/site');
  await dialog.getByLabel('Repository address').press('Enter');
  await expect(dialog.getByLabel('Account')).toHaveValue('gh-site');
  await dialog.getByRole('button', { name: 'Open as folder' }).click();
  await expect(page.getByRole('complementary', { name: 'Folder' }).getByRole('heading', { name: '📁 ada/site (main)' })).toBeVisible();
  // Remembered: next time the address opens with that token at once.
  expect(await page.evaluate(() => localStorage.getItem('pwo.git.repoAccounts'))).toBe('{"github.com/ada/site":"gh-site"}');
  // The tokens of the site tried in turn: the first one does not open it.
  expect(used[0]).toBe('pat_docs /repos/ada/site');
  expect(used).toContain('pat_site /repos/ada/site');
});
