import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('history: timeline replay and version compare', async ({ page }) => {
  await login(page, 'pm@example.com')
  await page.getByText('Maple Court (demo)').click()
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'Replay progress' })).toBeVisible()
  await expect(page.getByText('Loading model…')).toHaveCount(0, { timeout: 30_000 })
  // Drag the slider to the very start: nothing is done yet.
  const slider = page.getByLabel('Timeline')
  const min = await slider.getAttribute('min')
  await slider.fill(min!)
  await expect(page.getByText(/0 done · 0 in review/)).toBeVisible()
  await page.getByRole('button', { name: '▶ Play' }).click()
  await page.screenshot({ path: 'e2e/.results/m6-timeline.png' })
  await page.getByRole('tab', { name: 'Compare versions' }).click()
  await expect(page.getByText('Only one approved version so far.')).toBeVisible()
  await page.getByRole('link', { name: 'Full activity log →' }).click()
  await page.getByLabel('Event type').selectOption('model')
  await expect(page.getByText(/approved model v1/)).toBeVisible()
})
