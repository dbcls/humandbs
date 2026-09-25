import { expect, test } from "@playwright/test"

/**
 * Narrowing a listing, and getting back out of it.
 *
 * **Every condition has to reach the address.** A narrowed listing that cannot
 * be shared or bookmarked is the thing these scenarios are here to catch, so
 * each one presses a control and then reads the URL.
 */
test.describe("P-ANON 絞り込み", () => {
  test("S-SEARCH-01: キーワードで絞ると、条件がアドレスに載る", async ({ page }) => {
    await page.goto("/research")
    const before = Number(await page.getByRole("main").getAttribute("data-total") ?? 0)

    const box = page.getByRole("searchbox", { name: "キーワードで研究を検索" })
    await box.fill("cancer")
    await box.press("Enter")

    await expect(page).toHaveURL(/[?&]q=/)
    await expect(box).toHaveValue("cancer")
    // 絞った先も一覧のままで、表そのものは消えない
    await expect(page.getByRole("table")).toBeVisible()
    expect(before).toBeGreaterThanOrEqual(0)
  })

  test("S-SEARCH-02: キーワード欄を空にするとキーワードが解除される", async ({ page }) => {
    await page.goto("/research")
    const box = page.getByRole("searchbox", { name: "キーワードで研究を検索" })
    await box.fill("cancer")
    await box.press("Enter")
    await expect(page).toHaveURL(/[?&]q=/)

    // 打鍵で検索する経路。空は「条件が無い」ではなく「語を外す」を意味する
    await box.fill("")
    await expect(page).not.toHaveURL(/[?&]q=[^&]/, { timeout: 15_000 })
    await expect(box).toHaveValue("")
  })

  test("S-SEARCH-03: 結果が 0 件でも、表と絞り込みは残って理由を出す", async ({ page }) => {
    await page.goto("/research")
    const box = page.getByRole("searchbox", { name: "キーワードで研究を検索" })
    await box.fill("zzzzzzzznotarealword")
    await box.press("Enter")

    await expect(page).toHaveURL(/[?&]q=/)
    // 表は消えない。列の名前が「何を探していたか」を示す
    await expect(page.getByRole("table")).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "研究 ID" })).toBeVisible()
    await expect(page.getByLabel("絞り込み")).toBeVisible()
  })

  test("S-SEARCH-04: ページ送りがアドレスに載り、戻れる", async ({ page }) => {
    await page.goto("/research")
    const first = (await page.getByRole("link", { name: /^hum\d+$/ }).first().innerText()).trim()

    await page.getByRole("link", { name: "次へ" }).first().click()
    await expect(page).toHaveURL(/[?&]page=2/)
    // アドレスが変わるのと、行が入れ替わるのは別の瞬間
    const row = page.getByRole("link", { name: /^hum\d+$/ }).first()
    await expect(row).not.toHaveText(first)

    await page.goBack()
    await expect(row).toHaveText(first)
  })

  /**
   * **並び替えと表示件数は表の上だけ、件数とページ送りは上と下。** 表の下端に着いた読者が探すのは次の
   * ページで、そこに 1 ページ目へ戻す操作を置かない。両方の一覧が同じ部品を通るので両方で見る。
   */
  test("S-SEARCH-06: 並び替えと表示件数は表の上にだけ表示され、ページ送りは上と下に表示される", async ({ page }) => {
    for (const path of ["/research", "/dataset"]) {
      await page.goto(path)
      const main = page.getByRole("main")
      const table = await main.locator("table").first().boundingBox()
      expect(table, path).not.toBeNull()

      for (const name of ["並び替え", "表示件数"]) {
        const chooser = main.locator(`summary[aria-label^="${name}:"]`)
        await expect(chooser, `${path} ${name}`).toHaveCount(1)
        const box = await chooser.boundingBox()
        expect((box?.y ?? Infinity) + (box?.height ?? 0), `${path} ${name}`)
          .toBeLessThanOrEqual(table?.y ?? 0)
      }

      const pages = main.getByRole("navigation", { name: "ページ送り" })
      await expect(pages, path).toHaveCount(2)
      const under = await pages.last().boundingBox()
      expect(under?.y ?? 0, path).toBeGreaterThanOrEqual((table?.y ?? 0) + (table?.height ?? 0))
    }
  })

  test("S-SEARCH-05: 一覧の切り替えが条件を持ち越す", async ({ page }) => {
    await page.goto("/research")
    const box = page.getByRole("searchbox", { name: "キーワードで研究を検索" })
    await box.fill("cancer")
    await box.press("Enter")
    await expect(page).toHaveURL(/[?&]q=/)

    // 語は持ち越される — 同じ問いを別の行の種類に投げ直すのが切り替えの意味
    const toDatasets = page.getByLabel("一覧の切り替え").getByRole("link", { name: "データセット" })
    await expect(toDatasets).toHaveAttribute("href", /[?&]q=/)
    await toDatasets.click()
    await expect(page).toHaveURL(/\/dataset\?.*[?&]?q=/)
  })
})
