import { expect, test } from "../fixtures";

test("admin section", async ({ loggedInPage }) => {
  await loggedInPage.page.getByRole("link", { name: "Content" }).click();

  const list = loggedInPage.page.getByText('Content"Oprhan pages" listAdd');
  await list.isVisible();

  const listContainer = list.getByTestId("content-list-ul");

  const listSkeleton = list.getByTestId("skeleton-panel-items");

  const search = list.getByPlaceholder("Search by title or content…");

  await expect(listContainer).toBeVisible();

  await expect(listSkeleton).not.toBeVisible();

  await search.fill("guideline-");

  await expect(listSkeleton).toBeVisible({ timeout: 1000 });

  await expect(listSkeleton).not.toBeVisible({ timeout: 1000 });

  const someItem = listContainer.getByText("guideline-revision").first();
  await expect(someItem).toBeVisible();

  await someItem.click();

  expect(search).toHaveValue("guideline-");

  // const itemIds = await listContainer.locator("li > div > div > div").allTextContents();

  // expect(itemIds.map((i) => i.trim())).toEqual([
  //   "guideline-revision",
  //   "guideline-revision-2",
  //   "guideline-revision-3",
  //   "guideline-revision2",
  //   "guideline-revision3",
  //   "guideline-revision4",
  //   "guideline-revision5",
  //   "guideline-revision6",
  //   "guideline-revision7",
  // ]);
  // // await expect(loggedInPage.page.getByText('Content"Oprhan pages" listAdd')).toBeVisible();
});
