import { expect, test } from "../fixtures";

test("Content search field not resets on item click", async ({ loggedInPage }) => {
  await loggedInPage.page.getByRole("link", { name: "Content" }).click();

  const list = loggedInPage.page.getByText('Content"Oprhan pages" listAdd');
  await list.isVisible();

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

  await expect(loggedInPage.page.locator("main > div").nth(2).getByText("Details")).toBeVisible();

  expect(search).toHaveValue("guideline-");
});
