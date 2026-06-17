import { test as base } from "@playwright/test";

import { DocumentsPage } from "./DocumentsPage";
import { LoggedInPage } from "./LoggedInPage";

type Fixtures = {
  loggedInPage: LoggedInPage;
  documentsPage: DocumentsPage;
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

    await use(documentsPage)
  },
});

export { expect } from "@playwright/test";
