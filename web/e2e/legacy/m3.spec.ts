import { expect, test } from '@playwright/test'
import path from 'node:path'
import { login, openModel } from './helpers'

const DXF = path.resolve(process.cwd(), '../samples/dxf')

test('PM uploads DXF, reviews, builds and approves a model', async ({ page }) => {
  await login(page, 'pm@example.com')
  // fresh project
  await page.getByPlaceholder('Maple Court Townhomes').fill('House A e2e')
  await page.getByRole('button', { name: 'Create project' }).click()
  await page.getByRole('link', { name: 'Drawings' }).click()

  await page.locator('input[type=file]').setInputFiles(path.join(DXF, 'house_a_L1_arch.dxf'))
  await page.getByLabel('Level').selectOption('__new')
  await page.getByLabel('New level name').fill('Level 1')
  await page.getByRole('button', { name: 'Upload & detect' }).click()
  await expect(page.getByText('8 walls · 4 doors · 5 windows · 5 rooms')).toBeVisible({ timeout: 30_000 })

  await page.locator('input[type=file]').setInputFiles(path.join(DXF, 'house_a_L1_plumbing.dxf'))
  await page.getByLabel('Trade / discipline').selectOption('plumbing')
  await page.getByLabel('Level').selectOption({ label: 'Building A › Level 1' })
  await page.getByRole('button', { name: 'Upload & detect' }).click()
  await expect(page.getByText('5 fixtures · 19 pipe segments')).toBeVisible({ timeout: 30_000 })

  // Review the architectural sheet: the cased opening is flagged; rename a room.
  await page.getByRole('link', { name: 'house_a_L1_arch.dxf' }).click()
  await expect(page.getByTestId('sheet-svg')).toBeVisible()
  await expect(page.getByText("Gap in wall with no door or window symbol")).toBeVisible()
  await page.screenshot({ path: 'e2e/.results/m3-review.png' })
  // click the room polygon for BEDROOM 2 just below its label on the drawing
  const label = page.locator('.sheet-underlay text', { hasText: 'BEDROOM 2' })
  const bb = (await label.boundingBox())!
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height + 12)
  await page.getByLabel('Room name').fill('Guest bedroom')
  await page.getByRole('button', { name: 'Rename' }).click()
  await expect(page.locator('.plan-overlay text', { hasText: 'GUEST BEDROOM' })).toBeVisible()
  await expect(page.getByText('Your corrections: 0 added, 1 edited, 0 deleted')).toBeVisible()

  // Build the draft and approve it in 3D.
  await page.getByRole('link', { name: '← Drawings' }).click()
  await page.getByRole('button', { name: 'Build draft model' }).click()
  await page.getByRole('link', { name: /Review it in 3D and approve/ }).click({ timeout: 60_000 })
  await expect(page.getByText(/Draft v1/)).toBeVisible()
  await page.waitForFunction(() => ((window as any).__viewer?.elementIds.length ?? 0) > 30)
  await page.screenshot({ path: 'e2e/.results/m3-draft.png' })
  await page.getByRole('button', { name: 'Approve & publish' }).click()
  await expect(page.getByText(/Draft v1/)).toHaveCount(0)
  await page.getByRole('link', { name: 'Buildings & zones' }).click()
  await expect(page.getByText('GUEST BEDROOM')).toBeVisible()
})

test('clicking the 2D sheet selects and flies to the element in 3D', async ({ page }) => {
  await login(page, 'pm@example.com')
  await openModel(page, 'Maple Court (demo)')
  await page.getByLabel('Show drawing').selectOption({ label: 'duplex_L1_plumbing.dxf' })
  await expect(page.getByTestId('sheet-svg')).toBeVisible()
  await page.screenshot({ path: 'e2e/.results/m3-split.png' })
  // Select a toilet in 3D → its outline shows on the sheet.
  const id = await page.evaluate(() => {
    const v = (window as any).__viewer
    return v.elementIds.find((i: string) => v['meshes'].get(i).userData.discipline === 'plumbing')
  })
  await page.evaluate((i) => (window as any).__viewer.select(i, true), id)
  await expect(page.locator('[data-testid=sheet-svg] polygon[stroke="#7c4dff"]')).toHaveCount(1)
  // Click on the sheet near the middle → something gets selected in 3D and details open.
  const svg = (await page.getByTestId('sheet-svg').boundingBox())!
  await page.mouse.click(svg.x + svg.width * 0.3, svg.y + svg.height * 0.5)
  await expect(page.locator('[data-testid=sheet-svg] circle[fill="#d81b60"]')).toHaveCount(1)
})
