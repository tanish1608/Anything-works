import { expect, test } from '@playwright/test'
import path from 'node:path'
import { login, openModel } from './helpers'

const FIX = path.resolve(process.cwd(), 'e2e/fixtures')

test('plumber reports progress (incl. offline), PM approves, element turns green', async ({ page, context, browser }) => {
  await login(page, 'plumber@example.com')
  await page.goto('/field')
  await page.getByRole('link', { name: /Maple Court/ }).click()
  await page.getByRole('link', { name: 'UNIT 101 BATH' }).click()
  await expect(page.getByText(/plumbing items/)).toBeVisible()
  const boxes = page.locator('.check-item input[type=checkbox]:not([disabled])')
  await expect(boxes.first()).toBeVisible()
  const before = await boxes.count()
  await boxes.nth(0).check()
  await boxes.nth(1).check()
  await page.getByLabel('Add photos').setInputFiles([path.join(FIX, 'site1.jpg'), path.join(FIX, 'site2.jpg')])
  await page.screenshot({ path: 'e2e/.results/m4-field.png', fullPage: true })
  await page.getByRole('button', { name: 'Submit 2 items' }).click()
  await expect(page.getByRole('status')).toHaveText(/Sent for review/)
  await expect(page.locator('.check-item .badge', { hasText: 'Needs review' })).toHaveCount(2)

  // Offline: report is kept on the phone and synced when signal returns. (The zone was opened earlier
  // with signal; in production the service worker also serves cached checklists.)
  await page.getByRole('link', { name: 'Back' }).click()
  await page.getByRole('link', { name: 'UNIT 101 LIVING' }).click()
  await expect(page.locator('.check-item').first()).toBeVisible()
  await page.getByRole('link', { name: 'Back' }).click()
  await context.setOffline(true)
  await page.getByRole('link', { name: 'UNIT 101 LIVING' }).click()
  await page.locator('.check-item input[type=checkbox]:not([disabled])').first().check()
  await page.getByLabel('Add photos').setInputFiles([path.join(FIX, 'site3.jpg')])
  await page.getByRole('button', { name: 'Submit 1 item' }).click()
  await expect(page.getByRole('status')).toHaveText(/Saved on this phone/)
  await expect(page.getByTestId('queue-badge')).toHaveText(/1 waiting to sync/)
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByTestId('queue-badge')).toHaveText(/All synced/, { timeout: 15_000 })
  expect(before).toBeGreaterThan(2)

  // PM approves one claim from the bath upload.
  const ctx2 = await browser.newContext()
  const pm = await ctx2.newPage()
  await login(pm, 'pm@example.com')
  await pm.getByText('Maple Court (demo)').click()
  await pm.getByRole('link', { name: 'Progress' }).click()
  await expect(pm.getByRole('heading', { name: 'Waiting for your review (2)' })).toBeVisible()
  await pm.screenshot({ path: 'e2e/.results/m4-review.png', fullPage: true })
  await pm.getByRole('button', { name: 'Approve', exact: true }).first().click()
  await expect(pm.locator('.badge', { hasText: 'approved' })).toHaveCount(1)

  // Model shows green (done), amber (in review) and default colors.
  await pm.getByRole('link', { name: '3D model' }).click()
  await pm.waitForFunction(() => ((window as any).__viewer?.elementIds.length ?? 0) > 30)
  const colors = () => pm.evaluate(() => {
    const v = (window as any).__viewer
    const c: Record<string, number> = {}
    for (const m of v['meshes'].values()) c[m.material.color.getHexString()] = (c[m.material.color.getHexString()] ?? 0) + 1
    return c
  })
  await expect.poll(async () => (await colors())['43a047']).toBe(1) // green: approved with photo evidence
  expect((await colors())['ffb300']).toBe(2) // amber: claimed, waiting for review
})
