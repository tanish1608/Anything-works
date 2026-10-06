import { expect, test } from '@playwright/test'

test('root opens the chosen workspace and all main pages share its navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Workspace', exact: true })
  for (const name of ['People', 'Logs', 'Setup', 'Building', 'Home']) {
    await nav.getByRole('link', { name, exact: true }).click()
    await expect(page.getByRole('link', { name: 'Everything Works AI', exact: true })).toBeVisible()
    await expect(page).not.toHaveURL(/\/demo/)
  }
})

test('a saved building link survives the redirect and a page refresh', async ({ page }) => {
  await page.goto('/demo/building?work=ISS-031')
  await expect(page).toHaveURL(/\/building\?work=ISS-031$/)
  await expect(page.getByRole('region', { name: 'Building viewer' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Building viewer' })).toBeVisible()
  await expect(page.getByLabel('Level', { exact: true })).toBeVisible()
})

test('mobile navigation opens canonical pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('navigation', { name: 'Mobile workspace' }).getByRole('link', { name: 'People', exact: true }).click()
  await expect(page).toHaveURL(/\/people$/)
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible()
})
