import { expect, test } from "@playwright/test"

/**
 * Narrowing by a facet, and carrying the result out (`docs/public-pages.md`).
 *
 * **A condition that cannot be undone is a dead end**, and one that does not
 * reach the export is a file that is not what the reader is looking at. Both
 * are what these scenarios watch.
 */
test.describe("P-ANON 絞り込みと持ち出し", () => {
  test("S-FACET-01: 値を選ぶと条件がアドレスに載り、外して戻せる", async ({ page }) => {
    await page.goto("/research")
    const pane = page.getByLabel("絞り込み")

    // 軸は畳まれた状態で並ぶので、開いてから値を選ぶ
    const axis = pane.locator("details").first()
    await axis.locator("summary").first().click()
    const value = axis.getByRole("link").filter({ hasNotText: "すべて" }).first()
    await value.click()

    await expect(page).toHaveURL(/[?&]q=/)
    // 絞った先も一覧のまま。列の名前が消えると、何を見ていたか分からなくなる
    await expect(page.getByRole("table")).toBeVisible()
    await expect(pane).toBeVisible()

    // 外す道が同じ場所にある
    const all = pane.getByRole("link", { name: "すべて" }).first()
    await expect(all).toBeVisible()
    await all.click()
    await expect(page).toHaveURL(/\/research$/)
  })

  test("S-EXPORT-01: 書き出しは画面と同じ条件を持ち、表として返る", async ({ page, request }) => {
    await page.goto("/research")
    const box = page.getByRole("searchbox", { name: "キーワードで研究を検索" })
    await box.fill("cancer")
    await box.press("Enter")
    await expect(page).toHaveURL(/[?&]q=/)

    // 画面が絞られているなら、書き出しも同じ条件で絞られている
    const tsv = page.getByRole("link", { name: "TSV" })
    await expect(tsv).toHaveAttribute("href", /[?&]q=/)
    const href = (await tsv.getAttribute("href")) ?? ""
    expect(href).toMatch(/format=tsv/)

    const answer = await request.get(href)
    expect(answer.status()).toBe(200)
    const body = await answer.text()
    // 見出しの行と、少なくとも 1 行。区切りは tab
    expect(body.split("\n").filter((line) => line !== "").length).toBeGreaterThan(1)
    expect(body).toContain("\t")
  })

  test("S-EXPORT-02: 書き出しは絞っていない一覧でも全部を返す", async ({ page, request }) => {
    await page.goto("/research")
    const listed = await (await request.get("/api/research")).json() as { total: number }

    const tsv = page.getByRole("link", { name: "TSV" })
    const href = (await tsv.getAttribute("href")) ?? ""
    const answer = await request.get(href)
    const rows = (await answer.text()).split("\n").filter((line) => line !== "")
    // ページに切られない。持ち出しは画面に出ている 20 件のことではない
    expect(rows.length).toBeGreaterThan(listed.total / 2)
  })
})
