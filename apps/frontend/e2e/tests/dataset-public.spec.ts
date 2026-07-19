import { expect, test } from "@playwright/test";

test("translates moldata keys on the Japanese public dataset page", async ({ page }) => {
  await page.goto("/dataset/JGAD000051");

  await expect(page.getByText("材料と対象者", { exact: true })).toBeVisible();
  await expect(page.getByText("実験方法", { exact: true })).toBeVisible();
  await expect(page.getByText("試料説明", { exact: true })).toBeVisible();
  await expect(page.getByText("総データ量", { exact: true })).toBeVisible();
});
