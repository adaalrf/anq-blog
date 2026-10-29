import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { migrate } from '../src/server/migrate.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `search_browser_${randomUUID().replaceAll('-', '')}`;
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
  const author = randomUUID();
  await pool.query(
    "INSERT INTO members(id,username,display_name,bio,password_hash) VALUES ($1,'elin','Elin Berg','Design and little tools.','unused')",
    [author],
  );
  await pool.query(
    `INSERT INTO members(id,username,display_name,bio,password_hash) SELECT gen_random_uuid(),'person_'||lpad(n::text,3,'0'),'Community member '||n,'Fieldnotes and sketches','unused' FROM generate_series(1,23) n`,
  );
  await pool.query(
    `INSERT INTO posts(id,author_id,body,created_at) SELECT gen_random_uuid(),$1,'Fieldnotes '||n,'2026-10-01T12:00:00.123456Z' FROM generate_series(1,25) n`,
    [author],
  );
  await pool.query('INSERT INTO posts(id,author_id,body) VALUES ($1,$2,$3)', [
    randomUUID(),
    author,
    'A literal needle_% and <script>plain text</script>.',
  ]);
  const config = loadConfig({ DATABASE_URL: 'test' });
  app = await createApp(pool, config);
  config.origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(config.origin);
  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Find your next conversation.', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Enter a word or phrase to find posts and members.', { exact: true }),
  ).toBeVisible();
  async function search(q: string) {
    await page.getByLabel('Search the community', { exact: true }).fill(q);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
  }
  await page.evaluate(() => {
    (window as Window & { navigationMarker?: string }).navigationMarker = 'search-document';
  });
  await search('fieldnotes');
  await expect(
    page.getByText('3 posts on this page for “fieldnotes”.', { exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(() => (window as Window & { navigationMarker?: string }).navigationMarker),
    'search-document',
    'search submission must not reload the document',
  );
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(
    page.getByText('3 posts on this page for “fieldnotes”.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled();
  // Submitting even the same query must restart at page one.
  await search('fieldnotes');
  await expect(
    page.getByText('3 posts on this page for “fieldnotes”.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Search the community')).toHaveValue('fieldnotes');
  await page.getByRole('link', { name: 'Members', exact: true }).click();
  await expect(
    page.getByText('20 members on this page for “fieldnotes”.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(
    page.getByText('3 members on this page for “fieldnotes”.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'View profile', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /Community member/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('link', { name: 'Members', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await search('unfindable');
  await expect(page.getByText('No members found for “unfindable”.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Posts', exact: true }).click();
  await search('needle_%');
  await expect(
    page.getByText('A literal needle_% and <script>plain text</script>.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('article script')).toHaveCount(0);
  await page.getByRole('link', { name: '0 replies · Open thread', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conversation', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Search the community')).toHaveValue('needle_%');
  await search('');
  await expect(
    page.getByText('Enter a word or phrase to find posts and members.', { exact: true }),
  ).toBeVisible();
  let failOnce = true;
  await page.route('**/api/posts?*', async (route) => {
    if (failOnce) {
      failOnce = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Search temporarily unavailable.' }),
      });
    } else await route.continue();
  });
  await search('fieldnotes');
  await expect(page.getByRole('alert')).toContainText('Search temporarily unavailable.');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByText('3 posts on this page for “fieldnotes”.', { exact: true }),
  ).toBeVisible();
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(
    scan.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    [],
  );
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/search-desktop.png', fullPage: true });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `Search overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/search-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'Search browser checks passed: posts/members, pagination, empty queries/results, refresh/Back, profile/thread links, escaped text, retry, mobile layout and accessibility.',
  );
} finally {
  if (app) await app.close();
  await browser.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
