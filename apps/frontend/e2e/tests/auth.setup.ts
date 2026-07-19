import path from "node:path";

import { expect, test as setup } from "@playwright/test";

const authFile = path.join(import.meta.dirname, "../playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  // Perform authentication steps. Replace these actions with your own.

  const hydratedSign = page.locator('body[data-testhydrated="true"]');
  const loginBtn = page.getByTestId("login-btn");
  const loginField = page.getByRole("textbox", { name: "Username or email" });
  const passwordField = page.getByRole("textbox", { name: "Password" });
  const signInBtn = page.getByRole("button", { name: "Sign In" });

  await page.goto("/");
  await hydratedSign.waitFor();
  await loginBtn.click();
  await page.waitForURL("https://idp-staging.ddbj.nig.ac.jp/**");
  await loginField.fill(process.env.E2E_USERNAME!);
  await passwordField.fill(process.env.E2E_PASSWORD!);
  await signInBtn.click();
  await page.waitForURL("/admin");

  await expect(page.getByTestId("cms-left-panel")).toBeVisible();

  await page.context().storageState({ path: authFile });
});
