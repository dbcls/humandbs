import { expect, test } from "@playwright/test"

/**
 * The site's own writing (`docs/public-pages.md` の「サイトコンテンツ」).
 *
 * **A guideline is 16,000px tall**, so what a reader shares is a section
 * rather than the document. The ids come from the words of the heading, which
 * is what keeps an address that was shared pointing at the same section after
 * another one is added above it.
 */
test.describe("P-ANON 記事とお知らせ", () => {
  test("S-DOC-01: 記事の見出しはそれぞれのアドレスを持ち、そこへ飛べる", async ({ page }) => {
    await page.goto("/aim")

    // 見出しの脇に立つリンクが、その見出しの id を渡す
    const anchor = page.locator("main a[href^=\"#\"]").first()
    const target = (await anchor.getAttribute("href") ?? "").slice(1)
    expect(target).not.toBe("")

    await anchor.click()
    // アドレス欄は百分率で書くので、比べる前に読み下す
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(`#${target}`)
    // 渡された先が実在する。これが破れると共有されたアドレスが行き止まりになる
    await expect(page.locator(`[id="${target}"]`)).toBeVisible()
  })

  test("S-DOC-02: お知らせは一覧から個別へ辿れる", async ({ page }) => {
    await page.goto("/news")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ニュース")

    const item = page.locator("main a[href^=\"/news/\"]").first()
    const to = await item.getAttribute("href")
    await item.click()
    await expect(page).toHaveURL(new RegExp(`${to}$`))
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty()
  })

  test("S-DOC-03: お知らせを絞り込むと、条件がアドレスに載る", async ({ page }) => {
    await page.goto("/news")
    const box = page.getByRole("searchbox", { name: "ニュースを検索" })
    await box.fill("データ")
    await box.press("Enter")

    await expect(page).toHaveURL(/[?&]/)
    await expect(box).toHaveValue("データ")
  })

  test("S-DOC-04: 案内の 3 画面が応答する", async ({ page }) => {
    for (const path of ["/data-submission", "/data-use", "/contact-us"]) {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 }), path).not.toBeEmpty()
    }
  })
})
