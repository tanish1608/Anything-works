import { expect, type Page } from '@playwright/test'

export async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('demo-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
}

export async function openModel(page: Page, project: string) {
  await page.getByText(project).click()
  await expect(page.getByTestId('viewer').locator('canvas')).toBeVisible()
  await expect(page.getByText('Loading model…')).toHaveCount(0, { timeout: 30_000 })
  await page.waitForFunction(() => ((window as any).__viewer?.elementIds.length ?? 0) > 3)
}

export async function clickModelCenter(page: Page) {
  await page.evaluate(() => (window as any).__viewer.frame())
  await page.waitForTimeout(800)
  const box = (await page.getByTestId('viewer').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}
