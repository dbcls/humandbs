import type { Locator, Page } from "@playwright/test";

export class ResearchesPage {
  private readonly hydratedSign: Locator;
  private readonly researchesLink: Locator;
  readonly datasetsTab: Locator;
  readonly datasetRows: Locator;
  readonly datasetForm: Locator;

  constructor(public readonly page: Page) {
    this.hydratedSign = this.page.locator('body[data-testhydrated="true"]');
    this.researchesLink = this.page.getByRole("link", { name: "Researches", exact: true });
    this.datasetsTab = this.page.getByRole("tab", { name: "Datasets", exact: true });
    this.datasetRows = this.page.locator("table tbody tr");
    this.datasetForm = this.page.locator("form#dataset-edit-form");
  }

  async goAndWaitForHydration() {
    await this.page.goto("/admin");
    await this.hydratedSign.waitFor();
    await this.researchesLink.click();
    await this.page.waitForURL(/\/admin\/researches/);
  }

  getResearchItem(humId: string) {
    return this.page.getByTestId("list-item").filter({ hasText: humId });
  }

  async selectResearch(humId: string) {
    const researchItem = this.getResearchItem(humId);
    await researchItem.click();
    await this.datasetsTab.waitFor({ state: "visible" });
    return researchItem;
  }

  async selectFirstDataset() {
    await this.datasetsTab.click();
    await this.datasetRows.first().click();
    await this.datasetForm.waitFor({ state: "visible" });
  }
}
