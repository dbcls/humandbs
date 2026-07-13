import { expect, test } from "../fixtures";

test.describe("Admin researches CMS", () => {
  test("does not mark searchable fields as modified when a dataset first loads", async ({
    researchesPage,
  }) => {
    await researchesPage.selectResearch("hum0580");
    await researchesPage.selectFirstDataset();

    const datasetForm = researchesPage.datasetForm;
    await expect(datasetForm).toBeVisible();
    await expect(datasetForm.locator('button[data-type="reset"]')).toHaveCount(0);
  });

  test("saving a dataset clears all dataset modified indicators", async ({ researchesPage }) => {
    const { page } = researchesPage;
    const researchItem = researchesPage.getResearchItem("hum0580");
    await expect(researchItem).toHaveCount(1);
    await expect(researchItem.getByText("draft", { exact: true })).toBeVisible();
    await researchesPage.selectResearch("hum0580");

    await expect(researchesPage.datasetRows).not.toHaveCount(0);
    await researchesPage.selectFirstDataset();

    const datasetForm = researchesPage.datasetForm;
    await expect(datasetForm).toBeVisible();

    const experimentHeader = datasetForm.locator("label").filter({ hasText: "Header" }).first();
    const englishHeader = experimentHeader.getByPlaceholder("En");
    const originalHeader = await englishHeader.inputValue();
    const modifiedBadges = page.getByText("Modified", { exact: true });
    const saveButton = page.locator('button[form="dataset-edit-form"]');
    const cleanupHeader = `${originalHeader} cleanup-${crypto.randomUUID()}`;

    await expect(modifiedBadges).toHaveCount(0);

    async function saveAndExpectClean() {
      await saveButton.click();
      await expect(modifiedBadges).toHaveCount(0, { timeout: 15000 });
      await expect(saveButton).toBeDisabled();
    }

    try {
      await englishHeader.fill(`${originalHeader} e2e`);
      await expect(saveButton).toBeEnabled();
      await expect(modifiedBadges).toHaveCount(3);

      await saveAndExpectClean();
    } finally {
      if ((await englishHeader.inputValue()) !== originalHeader) {
        await englishHeader.fill(cleanupHeader);
        await expect(saveButton).toBeEnabled();
        await saveAndExpectClean();

        await englishHeader.fill(originalHeader);
        await expect(saveButton).toBeEnabled();
        await saveAndExpectClean();
      }
    }
  });
});
