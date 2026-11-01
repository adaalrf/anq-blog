import { checkNavigationTheme } from './navigation-theme.js';
import { workspaceLink } from './workspace-link.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';
import { chromium, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { hashPassword } from '../src/server/auth.js';
import { migrate } from '../src/server/migrate.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `browser_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
});
let app: Awaited<ReturnType<typeof createApp>> | undefined;
const errors: string[] = [];
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  for (const [username, name] of [
    ['elin', 'Elin Berg'],
    ['jonas', 'Jonas Lund'],
  ])
    await pool.query(
      'INSERT INTO members(id,username,display_name,bio,password_hash) VALUES ($1,$2,$3,$4,$5)',
      [
        randomUUID(),
        username,
        name,
        'Fictional community member.',
        await hashPassword('browser-test-password'),
      ],
    );
  const config = loadConfig({ DATABASE_URL: 'test' });
  app = await createApp(pool, config);
  config.origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const authorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const readerContext = await browser.newContext();
  const author = await authorContext.newPage();
  const reader = await readerContext.newPage();
  for (const page of [author, reader]) page.on('pageerror', (e) => errors.push(e.message));
  async function login(page: Page, username: string) {
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByLabel('Username', { exact: true })).toBeFocused();
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
    await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  }
  await author.goto(config.origin);
  await expect(author).toHaveTitle('Community · ANQ Blog');
  await author.keyboard.press('Tab');
  await expect(author.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await author.keyboard.press('Enter');
  await expect(author.getByRole('main')).toBeFocused();
  await login(author, 'elin');
  assert.deepEqual(
    await author
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link')
      .allTextContents(),
    ['Community', 'Following', 'Search', 'Your profile', 'Hidden posts'],
  );
  await author
    .getByRole('textbox', { name: 'What’s on your mind, Elin?', exact: true })
    .fill('A small beginning, and a question for the community.');
  await author.getByRole('button', { name: 'Publish post', exact: true }).click();
  await expect(
    author.getByText('A small beginning, and a question for the community.', { exact: true }),
  ).toBeVisible();
  await author.getByRole('link', { name: '0 replies · Open thread', exact: true }).click();
  const thread = author.url();
  await reader.goto(thread);
  await login(reader, 'jonas');
  await expect(reader.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await reader.getByLabel('Your reply', { exact: true }).fill('I am making a reading corner.');
  await reader.getByRole('button', { name: 'Publish reply', exact: true }).click();
  await expect(reader.getByText('I am making a reading corner.', { exact: true })).toBeVisible();
  await reader.goto(config.origin);
  await reader
    .getByRole('textbox', { name: 'What’s on your mind, Jonas?', exact: true })
    .fill('A note from Jonas for his followers.');
  await reader.getByRole('button', { name: 'Publish post', exact: true }).click();
  await expect(
    reader.getByText('A note from Jonas for his followers.', { exact: true }),
  ).toBeVisible();
  await author.reload();
  await expect(author.getByText('I am making a reading corner.', { exact: true })).toBeVisible();
  await expect(
    author.getByRole('link', { name: '1 reply · Open thread', exact: true }),
  ).toBeVisible();
  await author.getByRole('button', { name: 'Edit', exact: true }).click();
  await author
    .getByLabel('Edit your post', { exact: true })
    .fill('A small beginning. Edited after a good conversation.');
  await author.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    author
      .locator('.post-body')
      .filter({ hasText: 'A small beginning. Edited after a good conversation.' }),
  ).toBeVisible();
  await author.reload();
  await expect(
    author
      .locator('.post-body')
      .filter({ hasText: 'A small beginning. Edited after a good conversation.' }),
  ).toBeVisible();
  await author.evaluate(() => {
    (window as Window & { navigationMarker?: string }).navigationMarker = 'same-document';
  });
  await author.getByRole('link', { name: 'Jonas Lund', exact: true }).click();
  await expect(author.getByRole('heading', { name: 'Jonas Lund', exact: true })).toBeVisible();
  await expect(author).toHaveTitle('Jonas Lund · ANQ Blog');
  await expect(author.getByText('Fictional community member.', { exact: true })).toBeVisible();
  await expect(author.getByText('0 followers · 0 following', { exact: true })).toBeVisible();
  assert.equal(
    await author.evaluate(
      () => (window as Window & { navigationMarker?: string }).navigationMarker,
    ),
    'same-document',
  );
  await workspaceLink(author, 'Following');
  await expect(
    author.getByText('No posts from people you follow yet.', { exact: true }),
  ).toBeVisible();
  await author.goto(`${config.origin}/?profile=jonas`);
  await author.getByRole('button', { name: 'Follow Jonas Lund', exact: true }).click();
  await expect(author.getByText('1 follower · 0 following', { exact: true })).toBeVisible();
  await author.reload();
  await expect(
    author.getByRole('button', { name: 'Unfollow Jonas Lund', exact: true }),
  ).toBeVisible();
  await workspaceLink(author, 'Following');
  await expect(
    author.getByText('A note from Jonas for his followers.', { exact: true }),
  ).toBeVisible();
  await expect(
    author.getByText('A small beginning. Edited after a good conversation.', { exact: true }),
  ).toHaveCount(0);
  await author.reload();
  await expect(
    author.getByText('A note from Jonas for his followers.', { exact: true }),
  ).toBeVisible();
  const followingScan = await new AxeBuilder({ page: author })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    followingScan.violations.map((v) => v.id),
    [],
  );
  await author.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    author.getByText('A note from Jonas for his followers.', { exact: true }),
  ).toHaveCount(0);
  await expect(author.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await author.reload();
  await expect(author.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await author.getByLabel('Username', { exact: true }).fill('elin');
  await author.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await author.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    author.getByText('A note from Jonas for his followers.', { exact: true }),
  ).toBeVisible();
  for (const width of [390, 768]) {
    await author.setViewportSize({ width, height: 844 });
    assert.equal(
      await author.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `Following layout overflow at ${width}`,
    );
  }
  await author.goto(`${config.origin}/?profile=jonas`);
  await author.getByRole('button', { name: 'Unfollow Jonas Lund', exact: true }).click();
  await expect(
    author.getByRole('button', { name: 'Follow Jonas Lund', exact: true }),
  ).toBeVisible();
  await workspaceLink(author, 'Following');
  await expect(
    author.getByText('No posts from people you follow yet.', { exact: true }),
  ).toBeVisible();
  await author.goto(`${config.origin}/?profile=elin`);
  await expect(author.getByRole('heading', { name: 'Elin Berg', exact: true })).toBeVisible();
  await expect(author.getByRole('button', { name: 'Follow Elin Berg', exact: true })).toHaveCount(
    0,
  );
  await author.setViewportSize({ width: 1440, height: 1000 });
  await author.goto(thread);
  author.once('dialog', (dialog) => dialog.accept());
  await author.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(
    author.getByText('This post was deleted by its author.', { exact: true }),
  ).toBeVisible();
  await expect(author.getByText('I am making a reading corner.', { exact: true })).toBeVisible();
  await expect(author.getByLabel('Your reply', { exact: true })).toHaveCount(0);
  const id = (await pool.query("SELECT id FROM members WHERE username='elin'")).rows[0].id;
  await pool.query(
    `INSERT INTO posts(id,author_id,body,created_at) SELECT gen_random_uuid(),$1,'Paging note '||n,'2026-10-01T12:00:00.123456Z' FROM generate_series(1,25) n`,
    [id],
  );
  await author.goto(config.origin);
  await expect(author.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  const firstPageIds = await author
    .locator('article')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));
  assert.equal(firstPageIds.length, 6);
  let finishRequest!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  await author.route('**/api/posts?*', async (route) => {
    if (new URL(route.request().url()).searchParams.has('cursor')) await pending;
    await route.continue();
  });
  await author.getByRole('button', { name: 'Older posts', exact: true }).click();
  await expect(author.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  assert.equal(
    await author.locator('article').count(),
    6,
    'current posts stay visible during pagination',
  );
  await expect(author.getByRole('button', { name: 'Newer posts', exact: true })).toBeDisabled();
  finishRequest();
  await expect(author.getByText('Page 2', { exact: true })).toBeVisible();
  await expect(author.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  await expect(author.getByRole('button', { name: 'Older posts', exact: true })).toBeEnabled();
  const secondPage = await author
    .locator('article')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));
  assert.equal(secondPage.length, 6);
  assert.ok(
    secondPage.every((post) => !firstPageIds.includes(post)),
    'pages must not repeat posts',
  );
  await author.unroute('**/api/posts?*');
  await author.getByRole('button', { name: 'Newer posts', exact: true }).click();
  await expect(author.getByText('Page 1', { exact: true })).toBeVisible();
  await expect(author.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  // A full-page capture must retain the sidebar colour below the first viewport.
  const sidebarColour = await author
    .locator('.sidebar')
    .evaluate((node) =>
      getComputedStyle(node).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number),
    );
  const previousViewport = author.viewportSize()!;
  await author.setViewportSize({ width: previousViewport.width, height: 600 });
  const longCapture = await author.screenshot({ fullPage: true });
  const belowViewportColour = await author.evaluate(async (encoded) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + encoded;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 50, 650, 1, 1, 0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  }, longCapture.toString('base64'));
  assert.deepEqual(
    belowViewportColour,
    sidebarColour,
    'sidebar background must continue below the viewport in a long-page capture',
  );
  await author.setViewportSize(previousViewport);
  await author.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(author.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(author.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  const scan = await new AxeBuilder({ page: author })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    scan.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    [],
  );
  await mkdir('test-results', { recursive: true });
  await author.screenshot({ path: 'test-results/community-desktop.png', fullPage: true });
  for (const width of [390, 768]) {
    await author.setViewportSize({ width, height: 844 });
    assert.equal(
      await author.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `Overflow at ${width}`,
    );
  }
  await author.setViewportSize({ width: 390, height: 844 });
  await author.screenshot({ path: 'test-results/community-mobile.png', fullPage: true });
  await checkNavigationTheme(author, config.origin, true);
  assert.deepEqual(errors, []);
  console.log(
    'Browser checks passed: two members, publish/reply/reload, ownership controls, edit/delete, profiles, follow/unfollow, following feed, sign-out/re-entry, pagination, responsive layout and accessibility scans.',
  );
} finally {
  if (app) await app.close();
  await browser.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
