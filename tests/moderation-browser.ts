import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';
import { chromium, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { migrate } from '../src/server/migrate.js';
import { hashPassword } from '../src/server/auth.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `moderation_browser_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
});
let app: Awaited<ReturnType<typeof createApp>> | undefined;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  const author = randomUUID(),
    readerId = randomUUID(),
    first = randomUUID(),
    second = randomUUID();
  for (const [id, username, name, staff] of [
    [author, 'elin', 'Elin Berg', false],
    [readerId, 'jonas', 'Jonas Lund', false],
    [randomUUID(), 'moderator', 'Community Moderator', true],
  ] as const)
    await pool.query(
      'INSERT INTO members(id,username,display_name,password_hash,is_moderator) VALUES ($1,$2,$3,$4,$5)',
      [id, username, name, await hashPassword('browser-test-password'), staff],
    );
  await pool.query('INSERT INTO posts(id,author_id,body) VALUES ($1,$2,$3),($4,$2,$5)', [
    first,
    author,
    'A note needing context.',
    second,
    'An example that requires removal.',
  ]);
  await pool.query('INSERT INTO posts(id,author_id,parent_id,body) VALUES ($1,$2,$3,$4)', [
    randomUUID(),
    readerId,
    second,
    'A reply worth keeping.',
  ]);
  const config = loadConfig({ DATABASE_URL: 'test' });
  app = await createApp(pool, config);
  config.origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const reader = await (
    await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  ).newPage();
  const mod = await (
    await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  ).newPage();
  const observer = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  for (const page of [reader, mod, observer]) page.on('pageerror', (e) => errors.push(e.message));
  async function login(page: Page, username: string) {
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
    await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  }
  await reader.goto(`${config.origin}/?post=${first}`);
  await login(reader, 'jonas');
  await reader.getByRole('button', { name: 'Hide for me', exact: true }).click();
  await expect(reader.getByText('You hid this post.', { exact: true })).toBeVisible();
  await expect(reader.getByText('A note needing context.', { exact: true })).toHaveCount(0);
  await observer.goto(`${config.origin}/?post=${first}`);
  await expect(observer.getByText('A note needing context.', { exact: true })).toBeVisible();
  await reader.getByRole('link', { name: 'Hidden posts', exact: true }).click();
  await expect(reader.getByRole('heading', { name: 'Hidden posts.', exact: true })).toBeVisible();
  await reader.getByRole('button', { name: 'Unhide', exact: true }).click();
  await expect(
    reader.getByText('You have no hidden posts. Hiding only affects your view.', { exact: true }),
  ).toBeVisible();
  await reader.goto(`${config.origin}/?post=${first}`);
  await reader.getByRole('button', { name: 'Report', exact: true }).click();
  await reader.getByLabel('Report reason', { exact: true }).selectOption('other');
  await reader
    .getByLabel('Additional context (optional)', { exact: true })
    .fill('Please consider the surrounding conversation.');
  await reader.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect(
    reader.getByText('Report received. A moderator can review it.', { exact: true }),
  ).toBeVisible();
  await expect(reader.getByText('A note needing context.', { exact: true })).toBeVisible();
  await reader.goto(`${config.origin}/?view=moderation`);
  await expect(
    reader.getByText(
      'Moderator access is required. Your account can report posts but cannot review reports.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(reader.getByRole('link', { name: 'Moderation', exact: true })).toHaveCount(0);
  await mod.goto(config.origin);
  await login(mod, 'moderator');
  await mod.getByRole('link', { name: 'Moderation', exact: true }).click();
  await expect(mod.getByRole('heading', { name: 'Moderation queue.', exact: true })).toBeVisible();
  await expect(
    mod.getByText('Please consider the surrounding conversation.', { exact: true }),
  ).toBeVisible();
  await mod
    .getByLabel('Decision note', { exact: true })
    .fill('No removal needed after reviewing context.');
  await mod.getByRole('button', { name: 'Save decision', exact: true }).click();
  await expect(mod.getByText('No open reports.', { exact: true })).toBeVisible();
  await mod.getByRole('link', { name: 'Dismissed', exact: true }).click();
  await expect(
    mod.getByText('Report dismissed by @moderator: No removal needed after reviewing context.', {
      exact: true,
    }),
  ).toBeVisible();
  await observer.reload();
  await expect(observer.getByText('A note needing context.', { exact: true })).toBeVisible();
  await reader.goto(`${config.origin}/?post=${second}`);
  await reader.getByRole('button', { name: 'Report', exact: true }).click();
  await reader.getByLabel('Report reason', { exact: true }).selectOption('abuse');
  await reader.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect(
    reader.getByText('Report received. A moderator can review it.', { exact: true }),
  ).toBeVisible();
  await mod.getByRole('link', { name: 'Open', exact: true }).click();
  await mod.getByLabel('Decision', { exact: true }).selectOption('remove');
  await mod
    .getByLabel('Decision note', { exact: true })
    .fill('Removed after review of the reported content.');
  mod.once('dialog', (dialog) => dialog.accept());
  await mod.getByRole('button', { name: 'Save decision', exact: true }).click();
  await expect(mod.getByText('No open reports.', { exact: true })).toBeVisible();
  await mod.getByRole('link', { name: 'Removed', exact: true }).click();
  await mod.reload();
  await expect(
    mod.getByText('Post removed by @moderator: Removed after review of the reported content.', {
      exact: true,
    }),
  ).toBeVisible();
  await observer.goto(`${config.origin}/?post=${second}`);
  await expect(
    observer.getByText('This post was removed by a moderator.', { exact: true }),
  ).toBeVisible();
  await expect(
    observer.getByText('An example that requires removal.', { exact: true }),
  ).toHaveCount(0);
  await expect(observer.getByText('A reply worth keeping.', { exact: true })).toBeVisible();
  await login(observer, 'elin');
  await expect(observer.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(observer.getByLabel('Your reply', { exact: true })).toHaveCount(0);
  await mkdir('test-results', { recursive: true });
  await mod.screenshot({ path: 'test-results/moderation-desktop.png', fullPage: true });
  for (const page of [reader, mod]) {
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `Overflow at ${width}`,
      );
    }
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      scan.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
      [],
    );
  }
  await mod.setViewportSize({ width: 390, height: 844 });
  await mod.screenshot({ path: 'test-results/moderation-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'Moderation browser passed: personal hide/unhide, report, role gating, dismiss/remove, decision history, public redaction, retained replies, responsive layout and accessibility.',
  );
} finally {
  if (app) await app.close();
  await browser.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
