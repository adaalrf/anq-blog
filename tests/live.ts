// Explicitly mutates fictional accounts on the disposable VPS; never production.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
if (process.env.ANQ_BLOG_REHEARSAL !== '1' || !process.env.REHEARSAL_CREDENTIALS)
  throw new Error('Disposable rehearsal opt-in and protected credentials file required.');
const credentials: { username: string; password: string }[] = JSON.parse(
  await readFile(process.env.REHEARSAL_CREDENTIALS, 'utf8'),
);
assert.deepEqual(
  credentials.map((c) => c.username),
  ['elin', 'jonas', 'moderator'],
);
const origin = 'https://blog.anq-publish.invalid';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: ['--host-resolver-rules=MAP blog.anq-publish.invalid 95.217.135.13', '--no-proxy-server'],
});
async function api(page: Page, path: string, status: number, method = 'GET', body?: unknown) {
  const result = await page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch('/api' + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    },
    { path, method, body },
  );
  assert.equal(result.status, status, `${method} ${path}: ${JSON.stringify(result.body)}`);
  return result.body;
}
try {
  const pages: Page[] = [];
  for (const credential of credentials) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Username', { exact: true }).fill(credential.username);
    await page.getByLabel('Password', { exact: true }).fill(credential.password);
    await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    assert.ok(
      (await context.cookies()).some(
        (c) => c.name === 'blog_session' && c.secure && c.httpOnly && c.sameSite === 'Strict',
      ),
    );
    pages.push(page);
  }
  const [author, reader, moderator] = pages;
  const marker = randomUUID().slice(0, 8);
  const body = `A small beginning: leave the next person a clear place to start. Rehearsal ${marker}.`;
  await author.getByRole('textbox', { name: /What’s on your mind/ }).fill(body);
  await author.getByRole('button', { name: 'Publish post', exact: true }).click();
  await expect(author.getByText(body, { exact: true })).toBeVisible();
  const post = (await api(author, '/posts', 200)).items.find((p: any) => p.body === body);
  assert.ok(post);
  await api(reader, `/posts/${post.id}`, 403, 'PUT', { body: 'Not mine', version: post.version });
  const updated = await api(author, `/posts/${post.id}`, 200, 'PUT', {
    body: body + ' A good README counts.',
    version: post.version,
  });
  await api(author, `/posts/${post.id}`, 409, 'PUT', { body, version: post.version });
  await api(reader, `/posts/${post.id}/replies`, 201, 'POST', {
    body: 'Small, clear tools are easier to return to. Fictional rehearsal reply.',
  });
  await api(reader, '/posts', 201, 'POST', {
    body: `Making a little reading corner, and learning along the way. Rehearsal ${marker}.`,
  });
  assert.equal((await api(reader, '/members/elin/follow', 200, 'PUT', {})).following, true);
  assert.ok(
    (await api(reader, '/posts?feed=following', 200)).items.some((p: any) => p.id === post.id),
  );
  await api(reader, `/posts/${post.id}/hide`, 200, 'PUT', {});
  assert.ok(!(await api(reader, '/posts', 200)).items.some((p: any) => p.id === post.id));
  await api(reader, `/posts/${post.id}/hide`, 200, 'DELETE', {});
  const report = await api(reader, `/posts/${post.id}/reports`, 200, 'POST', {
    reason: 'other',
    details: 'Fictional report to verify moderation on the disposable deployment.',
  });
  await api(reader, '/moderation/reports', 403);
  const queued = (await api(moderator, '/moderation/reports', 200)).items.find(
    (r: any) => r.postId === post.id,
  );
  assert.ok(queued && report);
  await api(moderator, `/moderation/reports/${queued.id}/decision`, 200, 'POST', {
    action: 'dismiss',
    note: 'Rehearsal only; the fictional post is suitable.',
  });
  await author.reload();
  await expect(author.getByText(updated.body, { exact: true })).toBeVisible();
  await author.setViewportSize({ width: 1440, height: 1000 });
  const scan = await new AxeBuilder({ page: author })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  await mkdir('test-results', { recursive: true });
  await author.screenshot({
    path: 'test-results/disposable-community-desktop.png',
    fullPage: true,
  });
  for (const width of [390, 768]) {
    await author.setViewportSize({ width, height: 844 });
    assert.ok(await author.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  for (const page of pages) {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    assert.equal((await api(page, '/session', 200)).member, null);
  }
  console.log(
    'Disposable HTTPS deployment passed: private member logins, secure sessions, UI publish, ownership/stale edits, replies, following, hide/unhide, moderation, persisted refresh, mobile/a11y and logout. Fictional posts retained for recovery checks.',
  );
} finally {
  await browser.close();
}
