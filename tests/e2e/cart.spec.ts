import { expect, test } from "@playwright/test"

/**
 * The collection a reader builds before applying.
 *
 * **This is the one part of the portal whose state is kept in the browser.** The
 * unit tests run without a window, so the store's own reading and writing —
 * that it survives a reload, that it is one collection across screens, that
 * taking something out can be undone — is only reachable here.
 */
test.describe("P-ANON カート", () => {
  test("S-CART-01: 一覧でボタンを押すとカートに入り、リロードしても残る", async ({ page }) => {
    await page.goto("/research")
    const toggle = page.getByRole("button", { name: "この研究のデータセットをカートに入れる／外す" }).first()
    await expect(toggle).toHaveAttribute("aria-pressed", "false")

    await toggle.click()
    await expect(toggle).not.toHaveAttribute("aria-pressed", "false")

    // browser に保存されるので、ページを取り直しても同じ状態になる
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
    await expect(page.getByRole("heading", { level: 1 })).toContainText("利用申請の対象となるデータセット")
    // 行は browser から取りに行くので、出るまでに一手ある
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ }).first()).toBeVisible()
  })

  test("S-CART-03: 押し直すとカートから外れ、カートの画面にも反映される", async ({ page }) => {
    await page.goto("/research")
    const toggle = page.getByRole("button", { name: "この研究のデータセットをカートに入れる／外す" }).first()
    await toggle.click()
    await expect(toggle).not.toHaveAttribute("aria-pressed", "false")

    await page.goto("/cart")
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ }).first()).toBeVisible()

    // 同じボタンで出ていく。入ってきた経路からしか出られないのでは困る
    await page.goto("/research")
    const back = page.getByRole("button", { name: "この研究のデータセットをカートに入れる／外す" }).first()
    await back.click()
    await expect(back).toHaveAttribute("aria-pressed", "false")

    await page.goto("/cart")
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ })).toHaveCount(0)
  })

  test("S-CART-04: 何も入れていないカートには、行が無い", async ({ page }) => {
    await page.goto("/cart")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("利用申請の対象となるデータセット")
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ })).toHaveCount(0)
  })
})
