import type { Locator, Page } from "@playwright/test";

export class DocumentsPage {
  private readonly hydratedSign: Locator;
  readonly documentsList: Locator;
  readonly addNewButton: Locator;
  readonly resolvedDetailsSection: Locator;

  constructor(public readonly page: Page) {
    this.hydratedSign = this.page.locator('body[data-testhydrated="true"]');
    this.documentsList = this.page.getByTestId("documents-list-ul");
    this.addNewButton = this.page.getByRole("button", { name: "Add new" });
    this.resolvedDetailsSection = this.page.locator("main > div").filter({ hasText: "Publish" });
  }

  async goAndWaitForHydration() {
    await this.page.goto("/admin/documents");
    await this.hydratedSign.waitFor();
  }

  async createAndSelectDocument() {
    const contentId = `playwright-test-${crypto.randomUUID()}`;

    await this.addNewButton.click();
    await this.page.getByRole("textbox", { name: "Content ID" }).fill(contentId);

    const submitButton = this.page.getByRole("button", { name: "Submit" });
    await submitButton.waitFor({ state: "visible" });
    await submitButton.click();

    await this.page.getByText("Enter content ID in ").waitFor({ state: "hidden" });

    await this.documentsList.getByText(contentId).click();
    await this.resolvedDetailsSection.waitFor({ state: "visible" });

    return { contentId, details: this.resolvedDetailsSection };
  }

  async getDetailsSectionForID(id: string) {
    await this.documentsList.getByText(id).click();

    const detailsSectionLocator = this.page.locator("main > div").filter({ hasText: id });

    await detailsSectionLocator.waitFor({ state: "visible", timeout: 10000 });

    return detailsSectionLocator;
  }
}
