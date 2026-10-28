import { expect, test } from '@playwright/test';

test('new user can onboard with sample data and see the dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Simple books for small businesses' })).toBeVisible();
  await expect(page.getByText('TEST MODE', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Your name').fill('E2E Owner');
  await page.getByLabel('E-mail').fill('e2e@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-pass');
  await page.getByLabel('Confirm password').fill('local-test-pass');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Try everything free for one month' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue to free trial' }).click();
  await expect(page.getByText('TEST MODE — no payment will be authorised')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start TEST MODE trial' }).click();

  await page.getByLabel('Business name').fill('E2E Garage');
  await page.getByText('Explore with sample data').click();
  await page.getByRole('button', { name: 'Finish setup' }).click();

  await expect(page.getByRole('heading', { name: 'E2E Garage' })).toBeVisible();
  await expect(page.getByText('Sample data is loaded.')).toBeVisible();
  await expect(page.getByText('Customers owe you')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Invoices' }).click();
  await expect(page.getByRole('heading', { name: 'Quotations & invoices' })).toBeVisible();

  // Survives a reload (persisted locally)
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Quotations & invoices' })).toBeVisible();
});
