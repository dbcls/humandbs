import { expect, test } from "@playwright/test"

/**
 * The collection a reader builds before applying (`docs/testing.md` の P-ANON).
 *
 * **This is the one part of the portal whose state lives in the browser.** The
 * unit tests run without a window, so the store's own reading and writing —
 * that it survives a reload, that it is one collection across screens, that
 * taking something out can be undone — is only reachable here.
 */
test.describe("P-ANON カート", () => {
  test("S-CART-01: 一覧で印を押すとカートに入り、リロードしても残る", async ({ page }) => {
    await page.goto("/research")
    const mark = page.getByRole("button", { name: "この研究のデータセットをカートに入れる／外す" }).first()
    await expect(mark).toHaveAttribute("aria-pressed", "false")

    await mark.click()
    await expect(mark).not.toHaveAttribute("aria-pressed", "false")

    // browser が持つので、ページを取り直しても同じことを言う
    await page.reload()
    const again = page.getByRole("button", { name: "この研究のデータセットをカートに入れる／外す" }).first()
    await expect(again).not.toHaveAttribute("aria-pressed", "false")
  })

  test("S-CART-02: 入れたものがカートの画面に出る", async ({ page }) => {
    await page.goto("/research")
    await page.getByRole("button", { name: "この研究のデータセットをカートに入れる／外す" }).first().click()
    await expect(page.getByRole("button", { name: "この研究のデータセットをカートに入れる／外す" }).first())
      .not.toHaveAttribute("aria-pressed", "false")

    await page.goto("/cart")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("カート")
    // 行は browser から取りに行くので、出るまでに一手ある
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ }).first()).toBeVisible()
  })

  test("S-CART-03: 押し直すと出ていき、カートの画面もそう言う", async ({ page }) => {
    await page.goto("/research")
    const mark = page.getByRole("button", { name: "この研究のデータセットをカートに入れる／外す" }).first()
    await mark.click()
    await expect(mark).not.toHaveAttribute("aria-pressed", "false")

    await page.goto("/cart")
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ }).first()).toBeVisible()

    // 同じ印で出ていく。入ってきた道からしか出られないのでは困る
    await page.goto("/research")
    const back = page.getByRole("button", { name: "この研究のデータセットをカートに入れる／外す" }).first()
    await back.click()
    await expect(back).toHaveAttribute("aria-pressed", "false")

    await page.goto("/cart")
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ })).toHaveCount(0)
  })

  test("S-CART-04: 何も入れていないカートは、行を持たない", async ({ page }) => {
    await page.goto("/cart")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("カート")
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ })).toHaveCount(0)
  })
})
