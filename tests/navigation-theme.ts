import assert from 'node:assert/strict';
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function checkNavigationTheme(source: Page, origin: string, hasMenu: boolean) {
  const page = await source.context().newPage();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const canvases: string[] = [];
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      for (const width of [1280, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin);
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          `${colorScheme} overflow at ${width}px`,
        );
        if (width === 1280)
          canvases.push(
            await page.evaluate(() =>
              getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim(),
            ),
          );
        const scan = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        assert.deepEqual(
          scan.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
          [],
          `${colorScheme} at ${width}px`,
        );
        if (width === 320 && hasMenu) {
          const toggle = page.locator('.navigation-toggle');
          await expect(toggle).toHaveAccessibleName('Menu');
          const size = await toggle.boundingBox();
          assert.ok(size && size.width >= 44 && size.height >= 44);
          await toggle.focus();
          await page.keyboard.press('Space');
          await expect(toggle).toHaveAttribute('aria-expanded', 'true');
          await expect(toggle).toHaveAccessibleName('Close menu');
          await page.keyboard.press('Tab');
          await expect(page.locator('.navigation-panel nav a').first()).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(toggle).toBeFocused();
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        }
        if (width === 320) {
          // A fixture-only spacer exercises scrolling even with an empty workspace.
          await page.evaluate(() => {
            const x = document.createElement('div');
            x.style.height = '1200px';
            x.setAttribute('aria-hidden', 'true');
            document.querySelector('main')!.append(x);
            window.scrollTo({ top: 1000, behavior: 'instant' });
          });
          const top = page
            .getByRole('button', { name: 'Back to top', exact: true })
            .or(page.getByRole('link', { name: 'Back to top', exact: true }));
          await expect(top).toBeVisible();
          const header = page.locator(hasMenu ? '.navigation-shell' : 'header');
          assert.ok(
            Math.abs((await header.first().boundingBox())!.y) < 1,
            'Navigation stays in view',
          );
          await top.click();
          await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
        }
      }
    }
    assert.notEqual(canvases[0], canvases[1], 'System preference changes the colour palette');
  } finally {
    await page.close();
  }
}
