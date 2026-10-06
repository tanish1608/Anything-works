import { expect, test } from "@playwright/test";

test("one building viewer remains mounted across contextual workflows", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Building workspace" }),
  ).toBeVisible();
  const canvas = page.getByTestId("viewer");
  await expect(canvas.locator("canvas")).toBeVisible();
  for (const name of [
    "Project pulse",
    "Progress history",
    "Project team",
    "Project context",
  ]) {
    await page.getByLabel("Open project menu").click();
    await page.getByRole("menuitem", { name, exact: true }).click();
    await expect(
      page.getByRole("complementary", { name, exact: true }),
    ).toBeVisible();
    await expect(canvas).toHaveCount(1);
  }
});

test("saved issue bookmarks open evidence and room context after refresh", async ({
  page,
}) => {
  await page.goto("/demo/building?work=ISS-031");
  await expect(page).toHaveURL(/\/\?.*panel=record/);
  await expect(
    page.getByRole("complementary", { name: "Work record" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Work record" }),
  ).toBeVisible();
  const location = page.getByRole("navigation", { name: "Model location" });
  await expect(
    location.getByRole("button", { name: "Unit A", exact: true }),
  ).toBeVisible();
  await expect(
    location.getByRole("button", { name: "Bedroom 2", exact: true }),
  ).toBeVisible();
});

test("mobile work selection opens the contextual panel with the building still visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Open work and issues").click();
  await expect(
    page.getByRole("complementary", { name: "Work & issues" }),
  ).toBeVisible();
  await page
    .getByRole("complementary")
    .getByRole("button", { name: /Bedroom pipe connection/ })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Work record" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Building workspace" }),
  ).toBeVisible();
  await page.getByLabel("Close side panel").click();
  await expect(page.getByRole("complementary")).toHaveCount(0);
});
