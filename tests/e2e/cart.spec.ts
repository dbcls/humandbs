import { expect, test } from "@playwright/test"

import { researchWithJgads } from "./_instance"
import { openScreen } from "./_screen"

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
    await openScreen(page, "/research")
    const toggle = page.getByRole("button", { name: "この研究のデータセットをカートに入れる" }).first()
    await expect(toggle).toHaveAttribute("aria-pressed", "false")

    await toggle.click()
    await expect(toggle).not.toHaveAttribute("aria-pressed", "false")

    // browser に保存されるので、ページを取り直しても同じ状態になる
    await page.reload()
    await page.waitForLoadState("networkidle")
    const again = page.getByRole("button", { name: "この研究のデータセットをカートに入れる" }).first()
    await expect(again).not.toHaveAttribute("aria-pressed", "false")
  })

  test("S-CART-02: 入れたものがカートの画面に出る", async ({ page }) => {
    await openScreen(page, "/research")
    await page.getByRole("button", { name: "この研究のデータセットをカートに入れる" }).first().click()
    await expect(page.getByRole("button", { name: "この研究のデータセットをカートに入れる" }).first())
      .not.toHaveAttribute("aria-pressed", "false")

    await openScreen(page, "/cart")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("利用申請の対象となるデータセット")
    // 行は browser から取りに行くので、出るまでに一手ある
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ }).first()).toBeVisible()
  })

  test("S-CART-03: 押し直すとカートから外れ、カートの画面にも反映される", async ({ page }) => {
    await openScreen(page, "/research")
    const toggle = page.getByRole("button", { name: "この研究のデータセットをカートに入れる" }).first()
    await toggle.click()
    await expect(toggle).not.toHaveAttribute("aria-pressed", "false")

    await openScreen(page, "/cart")
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ }).first()).toBeVisible()

    // 同じボタンで出ていく。入ってきた経路からしか出られないのでは困る
    await openScreen(page, "/research")
    const back = page.getByRole("button", { name: "この研究のデータセットをカートに入れる" }).first()
    await back.click()
    await expect(back).toHaveAttribute("aria-pressed", "false")

    await openScreen(page, "/cart")
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ })).toHaveCount(0)
  })

  test("S-CART-04: 何も入れていないカートには、行が無い", async ({ page }) => {
    await openScreen(page, "/cart")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("利用申請の対象となるデータセット")
    await expect(page.getByRole("row").filter({ hasText: /JGAD\d+/ })).toHaveCount(0)
  })

  test("S-CART-05: 研究の行のボタンはその研究の JGAD をまとめて入れ外しし、カートは 1 回で空にでき、JSON で取り出せる", async ({ page, request }) => {
    const research = await researchWithJgads(request, 2)
    test.skip(research === null, "JGAD を 2 つ以上持つ研究が無い")
    if (research === null) return
    const [first = "", ...rest] = research.jgads
    const rows = page.getByRole("row").filter({ hasText: /JGAD\d+/ })

    // 1 つだけ入れておくと、研究のボタンは「一部」になり、押すと残りを入れる
    await openScreen(page, `/dataset/${first}`)
    await page.getByRole("button", { name: "カートに追加" }).click()
    await expect(page.getByRole("button", { name: "カートに入っています" })).toBeVisible()

    await openScreen(page, `/research?q=${encodeURIComponent(`id:${research.id}`)}`)
    const toggle = page.getByRole("button", { name: "この研究のデータセットをカートに入れる" }).first()
    await expect(toggle).toHaveAttribute("aria-pressed", "mixed")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-pressed", "true")

    await openScreen(page, "/cart")
    for (const id of [first, ...rest]) await expect(rows.filter({ hasText: id }), id).toHaveCount(1)
    // 申請フォームに貼り付ける JSON に、入れたものがすべてある
    await page.getByText("貼り付ける内容を見る").click()
    const payload = JSON.parse(await page.getByLabel("申請フォームに貼り付ける JSON").innerText()) as {
      components: { key: string, value: string }[]
    }
    expect(payload.components.map((one) => one.value).sort()).toEqual([first, ...rest].sort())
    expect(new Set(payload.components.map((one) => one.key))).toEqual(new Set(["use_dataset_request"]))

    // すべて入っていれば、押すとまとめて外れる
    await openScreen(page, `/research?q=${encodeURIComponent(`id:${research.id}`)}`)
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    await openScreen(page, "/cart")
    await expect(rows).toHaveCount(0)

    // 入れ直して、カートの画面の 1 回の操作で空にする
    await openScreen(page, `/research?q=${encodeURIComponent(`id:${research.id}`)}`)
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-pressed", "true")
    await openScreen(page, "/cart")
    await expect(rows.first()).toBeVisible()
    await page.getByRole("button", { name: "すべて外す" }).click()
    await expect(rows).toHaveCount(0)
    await page.reload()
    await expect(rows).toHaveCount(0)
  })
})
