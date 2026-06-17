import { expect, test } from "../fixtures";

test.describe("Admin documents CMS", () => {
  test("Shows list of documents", async ({ documentsPage }) => {
    const list = documentsPage.page.getByTestId("documents-list-ul");

    await list.waitFor({ timeout: 10000 });

    const items = list.locator("li");

    await expect(items).not.toHaveCount(0);
  });

  test("Selecting an item would show it's version to the right", async ({ documentsPage }) => {
    await documentsPage.documentsList.locator("li").first().click();

    const detailsPanelLocator = documentsPage.page
      .locator("main > div")
      .last()
      .getByText("EN", { exact: true });

    await expect(detailsPanelLocator).toBeVisible();
  });

  test("Creating new document would add it to list", async ({ documentsPage }) => {
    await documentsPage.addNewButton.click();
    const newDocPath = `playwright-test-${crypto.randomUUID()}`;
    const createdItemLocator = documentsPage.documentsList.getByText(newDocPath, { exact: true });

    await documentsPage.page.getByRole("textbox", { name: "Content ID" }).fill(newDocPath);

    const submitButton = documentsPage.page.getByRole("button", { name: "Submit" });

    await expect(submitButton).toBeEnabled();

    await submitButton.click();

    // modal disappears
    await expect(documentsPage.page.getByText("Enter content ID in ")).toBeHidden();

    // list item creates
    await expect(createdItemLocator).toBeVisible();

    await createdItemLocator.click();

    await expect(documentsPage.resolvedDetailsSection).toBeVisible();
  });

  test("Editing newly created document would add draft title to the list item", async ({
    documentsPage,
  }) => {
    async function switchToEn() {
      await enDraftTab.click();

      await expect(draftTab).toBeVisible();
    }

    async function switchToJa() {
      await jaDraftTab.click();

      await expect(draftTab).toBeVisible();
    }

    await documentsPage.addNewButton.click();
    const newDocPath = `playwright-test-${crypto.randomUUID()}`;

    await documentsPage.page.getByRole("textbox", { name: "Content ID" }).fill(newDocPath);

    const submitButton = documentsPage.page.getByRole("button", { name: "Submit" });

    await expect(submitButton).toBeEnabled();

    await submitButton.click();

    // modal disappears
    await expect(documentsPage.page.getByText("Enter content ID in ")).toBeHidden();

    const listItem = documentsPage.documentsList.getByText(newDocPath);

    await listItem.click();

    await expect(documentsPage.resolvedDetailsSection).toBeVisible();

    const jaDraftTab = documentsPage.resolvedDetailsSection.getByText("JA", { exact: true });

    await jaDraftTab.click();

    const draftTab = documentsPage.resolvedDetailsSection.getByRole("tab", { name: "Draft" });

    await switchToJa();

    const tabPanelDraft = documentsPage.resolvedDetailsSection.getByRole("tabpanel", {
      name: "Draft",
    });

    const detailsTitle = tabPanelDraft.getByRole("textbox", { name: "Title", exact: true });

    await expect(detailsTitle).toBeVisible();

    await detailsTitle.fill("draft ja title");

    const draftJaItemTitle = documentsPage.documentsList
      .locator("li")
      .filter({ hasText: newDocPath })
      .getByText("draft ja title");

    await expect(draftJaItemTitle).toBeVisible();
    await expect(draftJaItemTitle).toHaveCSS("font-style", "italic");

    // select EN tab

    const enDraftTab = documentsPage.resolvedDetailsSection.getByText("EN", { exact: true });

    await switchToEn();

    const tabEnPanelDraft = documentsPage.resolvedDetailsSection.getByRole("tabpanel", {
      name: "Draft",
    });

    const detailsEnTitleInput = tabEnPanelDraft.getByRole("textbox", {
      name: "Title",
      exact: true,
    });

    await expect(detailsEnTitleInput).toBeVisible();

    await detailsEnTitleInput.fill("draft en title");

    const draftEnItemTitle = documentsPage.documentsList
      .locator("li")
      .filter({ hasText: newDocPath })
      .getByText("draft en title");

    await expect(draftEnItemTitle).toBeVisible();
    await expect(draftEnItemTitle).toHaveCSS("font-style", "italic");

    // publish drafts
    //
    const publishBtn = documentsPage.resolvedDetailsSection.getByRole("button", {
      name: "Publish",
    });

    await publishBtn.click();

    await expect(publishBtn).toBeDisabled({ timeout: 5000 });

    await expect(draftJaItemTitle).not.toHaveCSS("font-style", "italic");
    await expect(draftEnItemTitle).not.toHaveCSS("font-style", "italic");

    const jaItemUnpublishedDot = documentsPage.documentsList
      .locator("li")
      .filter({ hasText: newDocPath })
      .locator("ul > li")
      .filter({ hasText: "draft ja title" })
      .locator("span.rounded-full");

    const enItemUnpublishedDot = documentsPage.documentsList
      .locator("li")
      .filter({ hasText: newDocPath })
      .locator("ul > li")
      .filter({ hasText: "draft en title" })
      .locator("span.rounded-full");

    await expect(jaItemUnpublishedDot).not.toBeVisible();
    await expect(enItemUnpublishedDot).not.toBeVisible();

    // now edit draft title ans expect the unpublished dot to appear in respective item's title;

    await switchToJa();

    await detailsTitle.fill("draft ja title1");

    // the title should remain published one, but the dot should appear

    await expect(draftJaItemTitle).toBeVisible();
    await expect(draftJaItemTitle).toHaveText("draft ja title");
    await expect(draftJaItemTitle).toHaveCSS("font-style", "normal");
    await expect(jaItemUnpublishedDot).toBeVisible({ timeout: 50000 });

    // switch to En tab and edit the title

    await switchToEn();

    await detailsEnTitleInput.fill("draft en title1");

    await expect(draftEnItemTitle).toBeVisible();
    await expect(draftEnItemTitle).toHaveText("draft en title");
    await expect(draftEnItemTitle).toHaveCSS("font-style", "normal");
    await expect(enItemUnpublishedDot).toBeVisible({ timeout: 50000 });

    await publishBtn.click();
    await expect(publishBtn).toBeDisabled({ timeout: 5000 });

    // expect the title in the item to be updated

    await expect(jaItemUnpublishedDot).not.toBeVisible({ timeout: 50000 });
    await expect(enItemUnpublishedDot).not.toBeVisible({ timeout: 50000 });
    await expect(draftJaItemTitle).toHaveText("draft ja title1", { timeout: 5000 });
    await expect(draftEnItemTitle).toHaveText("draft en title1", { timeout: 5000 });
  });
});
