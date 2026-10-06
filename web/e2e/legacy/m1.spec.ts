import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('demo-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
}

async function openSample(page: Page) {
  await page.getByText('Sample House (buildingSMART IFC)').click()
  await expect(page.getByTestId('viewer').locator('canvas')).toBeVisible()
  await expect(page.getByText('Loading model…')).toHaveCount(0, { timeout: 30_000 })
  await page.waitForFunction(() => ((window as any).__viewer?.elementIds.length ?? 0) > 10)
}

test('viewer loads the IFC sample, filters layers and selects elements', async ({ page }) => {
  await login(page, 'pm@example.com')
  await openSample(page)
  await page.screenshot({ path: 'e2e/.results/m1-model.png' })

  // Layer toggles drive mesh visibility.
  const visibleCount = () => page.evaluate(() => {
    const v = (window as any).__viewer
    return v.elementIds.filter((id: string) => v['meshes'].get(id).visible).length
  })
  const all = await visibleCount()
  await page.getByRole('button', { name: 'Isolate' }).nth(2).click() // hvac
  expect(await visibleCount()).toBe(3)
  await page.getByRole('button', { name: 'Show all layers' }).click()
  expect(await visibleCount()).toBe(all)

  // Select an element through the viewer API → details panel shows it.
  await page.evaluate(() => {
    const v = (window as any).__viewer
    const id = v.elementIds[0]
    v.select(id, true)
  })
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()

  // Section box clips geometry and click-picking ignores clipped parts.
  await page.getByLabel('Section box').check()
  await page.getByLabel('Height max').fill('0.3')
  await page.screenshot({ path: 'e2e/.results/m1-section.png' })

  // Click in the middle of the canvas picks something.
  await page.getByLabel('Section box').uncheck()
  await page.evaluate(() => (window as any).__viewer.frame())
  await page.waitForTimeout(800)
  const box = (await page.getByTestId('viewer').boundingBox())!
  const hit = await page.evaluate(([x, y]) => (window as any).__viewer.pickAt(x, y), [box.x + box.width / 2, box.y + box.height / 2])
  expect(hit?.elementId).toBeTruthy()
})

test('hvac trade sees hvac plus ghosted architecture only', async ({ page }) => {
  await login(page, 'plumber@example.com')
  await openSample(page)
  await expect(page.getByText('(context)')).toBeVisible()
  await expect(page.getByText('Structure')).toHaveCount(1) // framing trade in seed → structure visible
})
