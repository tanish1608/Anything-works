import { expect, test } from '@playwright/test';

test('Agent Isle opens above the same building and follows the active panel', async ({ page }) => {
  await page.goto('/');
  const building = page.getByRole('region', { name: 'Building workspace' });
  await expect(building).toBeVisible();
  await expect(page.getByTestId('viewer')).toHaveCount(1);
  const isle = page.getByRole('region', { name: 'Agent Isle', exact: true });
  const toggle = isle.getByRole('button', { name: /Agent Isle/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(isle.getByRole('button', { name: 'Connect project' })).toBeVisible();
  await page.getByLabel('Open work and issues').click();
  await expect(isle.getByText('Ask about work & issues')).toBeVisible();
  await expect(building).toBeVisible();
  await expect(page.getByTestId('viewer')).toHaveCount(1);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(isle.getByRole('button', { name: 'Connect project' })).not.toBeVisible();
  await page.getByLabel('Close side panel').click();
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.getByTestId('viewer')).toHaveCount(1);
});

test('real connected Agent Isle answers, cites sources and clears its conversation', async ({ page }) => {
  test.skip(process.env.AGENT_LIVE_TEST !== '1', 'Explicit opt-in requires seeded API, Gemini access and incurs one live request');
  await page.goto('/');
  const isle = page.getByRole('region', { name: 'Agent Isle', exact: true });
  await isle.getByRole('button', { name: /Agent Isle/ }).click();
  await isle.getByLabel('Email', { exact: true }).fill(process.env.AGENT_TEST_EMAIL || 'pm@example.com');
  await isle.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD || 'demo-password');
  await isle.getByRole('button', { name: 'Connect project' }).click();
  const project = isle.getByLabel('Connected project');
  await expect(project.locator('option', { hasText: 'Maple Court' })).toHaveCount(1);
  const id = await project.locator('option', { hasText: 'Maple Court' }).getAttribute('value');
  await project.selectOption(id!);
  await isle.getByLabel('Ask Agent Isle', { exact: true }).fill('Describe one retrieved project record and cite its source. What evidence should I collect next?');
  await isle.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(isle.locator('article.assistant')).toBeVisible({ timeout: 45_000 });
  await expect(isle.getByText('Partial project context · Suggestions only; no records changed.')).toBeVisible();
  await isle.locator('article.assistant summary').click();
  await expect(isle.locator('article.assistant details')).toContainText(/model|issue/);
  await isle.getByRole('button', { name: 'Clear conversation' }).click();
  await expect(isle.locator('article.assistant')).toHaveCount(0);
  await isle.getByRole('button', { name: 'Sign out' }).click();
  await expect(isle.getByRole('button', { name: 'Connect project' })).toBeVisible();
});
