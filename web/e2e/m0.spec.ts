import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('demo-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
}

test('PM edits structure and it shows in activity', async ({ page }) => {
  await login(page, 'pm@example.com')
  await page.getByText('Maple Court (demo)').click()
  await page.getByRole('link', { name: 'Buildings & zones' }).click()
  await expect(page.getByText('UNIT 101 LIVING')).toBeVisible()
  await page.getByPlaceholder('New zone, e.g. Unit 304, Bedroom 2').first().fill('Unit 101, Laundry')
  await page.getByRole('button', { name: 'Add' }).first().click()
  await expect(page.getByText('Unit 101, Laundry')).toBeVisible()
  await page.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByText('created zone “Unit 101, Laundry”')).toBeVisible()
})

test('plumber only sees assigned zones and cannot edit', async ({ page }) => {
  await login(page, 'plumber@example.com')
  await page.getByText('Maple Court (demo)').click()
  await page.getByRole('link', { name: 'Buildings & zones' }).click()
  await expect(page.getByText('UNIT 101 LIVING')).toBeVisible()
  await expect(page.getByText('UNIT 101 BEDROOM')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0)
})
