// Read-only smoke check of the actual Vite workspace; passwords never reach output.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const credentials: { username: string; password: string }[] = JSON.parse(
  await readFile('.local/member-credentials.json', 'utf8'),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5175');
  await expect(
    page.getByRole('heading', { name: 'A place for your ideas.', exact: true }),
  ).toBeVisible();
  for (const credential of credentials) {
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Username', { exact: true }).fill(credential.username);
    await page.getByLabel('Password', { exact: true }).fill(credential.password);
    await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Publish post', exact: true })).toBeVisible();
    if (credential.username === 'moderator') {
      await page.getByRole('link', { name: 'Moderation', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Moderation queue.', exact: true }),
      ).toBeVisible();
      const response = await context.request.get('http://localhost:5175/api/moderation/reports');
      assert.equal(response.status(), 200);
      await page.goto('http://localhost:5175');
    } else {
      await expect(page.getByRole('link', { name: 'Moderation', exact: true })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  }
  for (const file of ['.env', '.local/member-credentials.json']) {
    const response = await context.request.get(
      `http://localhost:5175/@fs/${process.cwd()}/${file}`,
    );
    assert.equal(response.status(), 403, `${file} must not be served`);
  }
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/local-community-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/local-community-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search the community', { exact: true }).fill('reading');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /posts on this page|No posts found/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Members', exact: true }).click();
  await page.getByLabel('Search the community', { exact: true }).fill('elin');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View profile', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Search the community', { exact: true })).toHaveValue('elin');
  await expect(page.getByRole('link', { name: 'Members', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    'Actual Vite workspace passed: all member logins, moderator access, session persistence, logout, post/member search, query refresh, credential/config serving denied, mobile layout; no content modified.',
  );
} finally {
  await browser.close();
}
