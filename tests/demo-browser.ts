import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { migrate } from '../src/server/migrate.js';
import { seedDemo } from '../src/server/demo.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `community_${randomUUID().replaceAll('-', '')}`;
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
  await seedDemo(pool);
  const config = loadConfig({ DATABASE_URL: 'test', DEMO_NOTICE: 'true' });
  app = await createApp(pool, config);
  config.origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(config.origin);
  await expect(page.getByRole('complementary', { name: 'About this demo' })).toContainText(
    'Fictional sample community',
  );
  await expect(page.getByRole('link', { name: 'A project by Martin Røed Flyum' })).toHaveAttribute(
    'href',
    'https://adaalrf.dev/work/anq-blog/',
  );
  await expect(page.locator('article')).toHaveCount(6);
  // The sign-in card sits centred on the content.
  await page.setViewportSize({ width: 1100, height: 844 });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const offCentre = await page.evaluate(() => {
    const card = document.querySelector('.login')!.getBoundingClientRect();
    const main = document.querySelector('main')!.getBoundingClientRect();
    return card.left + card.width / 2 - (main.left + main.width / 2);
  });
  assert.ok(Math.abs(offCentre) < 1, `Sign-in is ${offCentre}px off centre`);
  await page.getByRole('button', { name: 'Close sign in', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  // The masthead rule starts and ends with the content.
  assert.equal(
    new Set(
      await page.evaluate(() =>
        ['.navigation-shell', 'article.post', '.site-footer'].map((selector) => {
          const { left, right } = document.querySelector(selector)!.getBoundingClientRect();
          return `${Math.round(left)}-${Math.round(right)}`;
        }),
      ),
    ).size,
    1,
  );
  // Standalone controls meet the family's 44px target; links inside a sentence are exempt.
  assert.deepEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.workspace a, .workspace button, header a')]
        .filter((control) => {
          const sentence = control.closest('p, li');
          return !sentence || sentence.textContent.trim() === control.textContent.trim();
        })
        .filter((control) => control.getClientRects().length)
        .filter(
          (control) =>
            Math.max(
              control.getBoundingClientRect().height,
              parseFloat(getComputedStyle(control, '::after').height) || 0,
            ) < 44,
        )
        .map((control) => control.className + ':' + control.textContent.trim().slice(0, 24)),
    ),
    [],
  );
  await expect(page.getByRole('button', { name: 'Older posts', exact: true })).toBeEnabled();
  const removed = page
    .locator('article')
    .filter({ hasText: 'This post was removed by a moderator.' });
  await removed.getByRole('link', { name: '1 reply · Open thread' }).click();
  await expect(
    page.getByText('This reply stays in place so the conversation does not lose its context.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(config.origin + '/?view=search&q=keyboard-only');
  await expect(
    page.getByText('1 post on this page for “keyboard-only”.', { exact: true }),
  ).toBeVisible();
  await page.locator('article').getByRole('link', { name: '2 replies · Open thread' }).click();
  await expect(page.locator('article')).toHaveCount(3);
  await page.goto(config.origin + '/?profile=demo_elin');
  await expect(page.getByRole('heading', { name: 'Elin Berg', exact: true })).toBeVisible();
  await expect(page.getByText('2 followers', { exact: false })).toBeVisible();
  await page.goto(config.origin);
  await expect(page.locator('article')).toHaveCount(6);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'No mobile horizontal overflow',
    );
    const audit = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(audit.violations, []);
  }
  assert.deepEqual(errors, []);
  console.log(
    'Sample community: conversations, moderation placeholder, search, pagination, profile, mobile themes and accessibility passed.',
  );
} finally {
  await browser.close();
  if (app) await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
