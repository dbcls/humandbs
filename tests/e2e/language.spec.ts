import { expect, test } from "@playwright/test"

/**
 * The two languages the portal publishes in (`docs/public-pages.md`).
 *
 * **The language is in the address**, so switching is a link rather than a
 * setting — which is what makes a page in either language something to share.
 */
test.describe("P-ANON 言語", () => {
  test("S-LANG-01: 言語を切り替えても、見ていたページに留まる", async ({ page }) => {
    await page.goto("/research")
    await expect(page.getByRole("heading", { level: 1, name: "研究一覧" })).toBeVisible()

    await page.getByLabel(/言語|Language/).getByRole("link", { name: "EN" }).click()
    await expect(page).toHaveURL(/\/en\/research$/)
    await expect(page.getByRole("heading", { level: 1, name: "Research list" })).toBeVisible()

    // 戻る道も同じ形をしている
    await page.getByLabel(/言語|Language/).getByRole("link", { name: "JA" }).click()
    await expect(page).toHaveURL(/\/research$/)
    await expect(page.getByRole("heading", { level: 1, name: "研究一覧" })).toBeVisible()
  })

  test("S-LANG-02: 絞り込んだまま言語を変えても、条件は落ちない", async ({ page }) => {
    await page.goto("/research")
    const box = page.getByRole("searchbox", { name: "キーワードで研究を検索" })
    await box.fill("cancer")
    await box.press("Enter")
    await expect(page).toHaveURL(/[?&]q=/)

    const toEnglish = page.getByLabel(/言語|Language/).getByRole("link", { name: "EN" })
    await expect(toEnglish).toHaveAttribute("href", /[?&]q=/)
    await toEnglish.click()
    await expect(page).toHaveURL(/\/en\/research\?.*q=/)
  })

  test("S-LANG-03: 文書は両方の言語で応答し、lang を名乗る", async ({ page }) => {
    await page.goto("/aim")
    await expect(page.locator("html")).toHaveAttribute("lang", "ja")

    await page.goto("/en/aim")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty()
  })
})
