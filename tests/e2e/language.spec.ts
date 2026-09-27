import { expect, test } from "@playwright/test"

/**
 * The two languages the portal publishes in.
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

    // 戻る経路も同じ形をしている
    await page.getByLabel(/言語|Language/).getByRole("link", { name: "JA" }).click()
    await expect(page).toHaveURL(/\/research$/)
    await expect(page.getByRole("heading", { level: 1, name: "研究一覧" })).toBeVisible()
  })

  test("S-LANG-02: 絞り込んだまま言語を変えても、条件は解除されない", async ({ page }) => {
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

  test("S-LANG-03: 記事は両方の言語で表示され、html の lang がその言語になる", async ({ page }) => {
    await page.goto("/aim")
    await expect(page.locator("html")).toHaveAttribute("lang", "ja")

    await page.goto("/en/aim")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty()
  })

  test("S-LANG-04: /ja の付いた URL は、同じページの prefix の無い URL へリダイレクトする", async ({ request }) => {
    const { hits } = await (await request.get("/api/research")).json() as { hits: { id: string }[] }
    const research = hits[0]?.id ?? ""
    for (const [prefixed, target] of [
      ["/ja", "/"],
      ["/ja/research", "/research"],
      [`/ja/research/${research}`, `/research/${research}`],
      ["/ja/aim", "/aim"],
      // 検索の条件も同じページの一部
      ["/ja/research?q=cancer&sort=id", "/research?q=cancer&sort=id"],
    ] as [string, string][]) {
      const answer = await request.get(prefixed, { maxRedirects: 0 })
      expect(answer.status(), prefixed).toBe(302)
      const to = new URL(answer.headers().location ?? "", "http://invalid.example")
      expect(`${to.pathname}${to.search}`, prefixed).toBe(target)
    }
  })
})
