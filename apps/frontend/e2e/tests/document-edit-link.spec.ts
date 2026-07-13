import { expect, test } from "@playwright/test";

test("an admin can open a public document in the CMS", async ({ page }) => {
  await page.goto("/guidelines");

  const editButton = page.getByRole("link", { name: "このドキュメントを編集" });
  await expect(editButton).toBeVisible();
  await editButton.click();

  await expect(page).toHaveURL(/\/admin\/documents\?selectedId=guidelines/);
});
