import { expect, type Page } from '@playwright/test';
export async function workspaceLink(page: Page, name: string) {
  const link = page.getByRole('link', { name, exact: true });
  if (!(await link.isVisible()))
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await link.click();
}
