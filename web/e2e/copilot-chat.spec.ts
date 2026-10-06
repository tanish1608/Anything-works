import { expect, test } from '@playwright/test';

test('long answers scroll independently, remain readable and survive minimization', async ({ page }) => {
  await page.route('**/api/agent/public-chat', async route => {
    const input = route.request().postDataJSON();
    await route.fulfill({ json: { input_revision: input.input_revision, status: 'available',
      message: `Start of answer\n${'Discuss access with the framing lead and collect evidence.\n'.repeat(35)}End of answer`,
      sources: [], suggested_questions: [], partial_context: true } });
  });
  await page.goto('/?panel=record&work=PLAN-401');
  await page.getByRole('button', { name: 'Open Project Copilot', exact: true }).click();
  await page.getByLabel('Message Placeholder AI').fill('Help coordinate this work');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const log = page.getByRole('log', { name: 'Copilot conversation' });
  await expect(log).toContainText('End of answer');
  await expect.poll(() => log.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await log.evaluate(node => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  await expect(page.getByRole('button', { name: 'Latest ↓' })).toBeVisible();
  await page.getByRole('button', { name: 'Latest ↓' }).click();
  await expect.poll(() => log.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(3);
  await page.getByRole('button', { name: 'Close Project Copilot', exact: true }).click();
  await page.getByRole('button', { name: 'Open Project Copilot', exact: true }).click();
  await expect(log).toContainText('End of answer');
  await expect(page.getByLabel('Message Placeholder AI')).toBeVisible();
});
