import { expect, test } from '@playwright/test'
import { clickModelCenter, login, openModel } from './helpers'

test('PM pins an issue in 3D, assignee is notified and comments, element turns red', async ({ page, browser }) => {
  await login(page, 'pm@example.com')
  await openModel(page, 'Sample House (buildingSMART IFC)')
  await page.getByRole('button', { name: '+ Issue' }).click()
  await clickModelCenter(page)
  await expect(page.getByRole('heading', { name: 'New issue' })).toBeVisible()
  await expect(page.getByText('Pinned to the selected element.')).toBeVisible()
  await page.getByLabel('Title').fill('Crack in slab near entry')
  await page.getByLabel('Priority').selectOption('high')
  await page.getByLabel('Assignee').selectOption({ label: 'Paco Plumber' })
  await page.getByRole('button', { name: 'Create issue' }).click()
  await expect(page.getByRole('heading', { name: /#\d+ Crack in slab near entry/ })).toBeVisible()
  // The pinned element is now red in the model (open issue).
  const red = await page.evaluate(() => {
    const v = (window as any).__viewer
    return [...v['meshes'].values()].filter((m: any) => m.material.color.getHexString() === 'e53935').length
  })
  expect(red).toBe(1)
  await page.screenshot({ path: 'e2e/.results/m2-issue.png' })

  // Assignee: notification → issue → comment.
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'plumber@example.com')
  await p2.getByRole('button', { name: /Notifications \(1 unread\)/ }).click()
  await p2.getByText(/assigned to you: Crack in slab/).click()
  await expect(p2.getByRole('heading', { name: /Crack in slab near entry/ })).toBeVisible()
  await p2.getByLabel('Comment').fill('Will check tomorrow morning')
  await p2.getByRole('button', { name: 'Comment', exact: true }).click()
  await expect(p2.getByText('Will check tomorrow morning')).toBeVisible()
  await p2.getByLabel('Issue status').selectOption('in_progress')
  await expect(p2.locator('.badge', { hasText: 'In progress' })).toBeVisible()

  // Open in 3D from the issues list flies there.
  await page.getByRole('link', { name: 'Issues' }).click()
  await expect(page.getByRole('cell', { name: 'Crack in slab near entry' })).toBeVisible()
  await page.getByRole('link', { name: 'Open in 3D' }).first().click()
  await expect(page.getByRole('heading', { name: /Crack in slab near entry/ })).toBeVisible()
  await expect(page.getByText('Will check tomorrow morning')).toBeVisible()
})
