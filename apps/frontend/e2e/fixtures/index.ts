import { test as base } from "@playwright/test";

import { DocumentsPage } from "./DocumentsPage";
import { LoggedInPage } from "./LoggedInPage";
import { ResearchesPage } from "./ResearchesPage";

type Fixtures = {
  loggedInPage: LoggedInPage;
  documentsPage: DocumentsPage;
  researchesPage: ResearchesPage;
};

export const test = base.extend<Fixtures>({
  loggedInPage: async ({ page }, use) => {
    const loggedInPage = new LoggedInPage(page);

    await loggedInPage.login(process.env.E2E_USERNAME!, process.env.E2E_PASSWORD!);
    await use(loggedInPage);
  },
  documentsPage: async ({ page }, use) => {
    const documentsPage = new DocumentsPage(page);

    await documentsPage.goAndWaitForHydration();

    await use(documentsPage);
  },
  researchesPage: async ({ loggedInPage }, use) => {
    const researchesPage = new ResearchesPage(loggedInPage.page);

    await researchesPage.goAndWaitForHydration();

    await use(researchesPage);
  },
});

export { expect } from "@playwright/test";
