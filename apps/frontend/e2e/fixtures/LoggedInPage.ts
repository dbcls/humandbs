import type { Locator, Page } from "@playwright/test";

export class LoggedInPage {
  private readonly loginBtn: Locator;
  private readonly loginField: Locator;
  private readonly passwordField: Locator;
  private readonly signInBtn: Locator;
  private readonly hydratedSign: Locator;

  constructor(public readonly page: Page) {
    this.hydratedSign = this.page.locator('body[data-testhydrated="true"]');
    this.loginBtn = this.page.getByTestId("login-btn");
    this.loginField = this.page.getByRole("textbox", { name: "Username or email" });
    this.passwordField = this.page.getByRole("textbox", { name: "Password" });
    this.signInBtn = this.page.getByRole("button", { name: "Sign In" });
  }

  async login(username: string, password: string) {
    await this.page.goto("/");
    await this.hydratedSign.waitFor();

    if (await this.loginBtn.isVisible()) {
      await this.loginBtn.click();
      await this.page.waitForURL("https://idp-staging.ddbj.nig.ac.jp/**");
      await this.loginField.fill(username);
      await this.passwordField.fill(password);
      await this.signInBtn.click();
    }

    await this.page.goto("/admin");
    await this.page.getByTestId("cms-left-panel").waitFor({ state: "visible" });
  }
}
