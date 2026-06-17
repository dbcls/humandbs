import { expect, test } from "@playwright/test";

test("Content search field not resets on item click", async ({ page }) => {
  await page.getByRole("link", { name: "Content" }).click();

  const list = page.getByText('Content"Oprhan pages" listAdd');

  await expect(list).toBeVisible();

  const listContainer = list.getByTestId("content-list-ul");

  const listSkeleton = list.getByTestId("skeleton-panel-items");

  const search = list.getByPlaceholder("Search by title or content…");

  await expect(listContainer).toBeVisible();

  await expect(listSkeleton).not.toBeVisible();

  await search.fill("guideline-");

  await listSkeleton.waitFor({ state: "visible" });
  await listSkeleton.waitFor({ state: "hidden" });

  const someItem = listContainer.getByText("guideline-revision").first();
  await expect(someItem).toBeVisible();

  await someItem.click();

  await expect(page.locator("main > div").nth(2).getByText("Details")).toBeVisible();

  expect(search).toHaveValue("guideline-");
});
