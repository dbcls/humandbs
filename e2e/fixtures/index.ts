import { test as base } from "@playwright/test";

import { LoggedInPage } from "./LoggedInPage";

type Fixtures = {
  loggedInPage: LoggedInPage;
};

export const test = base.extend<Fixtures>({
  loggedInPage: async ({ page }, use) => {
    const loggedInPage = new LoggedInPage(page);

    await loggedInPage.login(process.env.E2E_USERNAME!, process.env.E2E_PASSWORD!);
    await use(loggedInPage);
  },
});

export { expect } from "@playwright/test";
