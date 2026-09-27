import { expect, test } from "@playwright/test"

/**
 * Narrowing by a facet, and exporting the result.
 *
 * **A condition that cannot be undone is a dead end**, and one that does not
 * reach the export is a file that is not what the reader is looking at. Both
 * are what these scenarios watch.
 */
test.describe("P-ANON 絞り込みと書き出し", () => {
  test("S-FACET-01: 値を選ぶと条件がアドレスに載り、外して戻せる", async ({ page }) => {
    await page.goto("/research")
    const pane = page.getByLabel("絞り込み")

    // 絞り込みの項目は折りたたまれた状態で並ぶので、開いてから値を選ぶ
    const axis = pane.locator("details").first()
    await axis.locator("summary").first().click()
    const value = axis.getByRole("link").filter({ hasNotText: "すべて" }).first()
    await value.click()

    await expect(page).toHaveURL(/[?&]q=/)
    // 絞った先も一覧のまま。列の名前が消えると、何を見ていたか分からなくなる
    await expect(page.getByRole("table")).toBeVisible()
    await expect(pane).toBeVisible()

    // 外す経路が同じ場所にある
    const all = pane.getByRole("link", { name: "すべて" }).first()
    await expect(all).toBeVisible()
    await all.click()
    await expect(page).toHaveURL(/\/research$/)
  })

  test("S-EXPORT-01: 書き出しにも画面と同じ条件が適用され、表として返る", async ({ page, request }) => {
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
    // ページで区切られない。書き出しは画面に表示している 20 件だけではない
    expect(rows.length).toBeGreaterThan(listed.total / 2)
  })

  test("S-FACET-02: 範囲の form を送ると、並び順と件数を保ったまま URL の検索式になる", async ({ page, request }) => {
    // 日付: 項目を開いて開始日を入れると、その場で送られる
    await page.goto("/research?sort=id&size=50")
    const pane = page.getByLabel("絞り込み")
    await pane.locator("summary", { hasText: /^公開日/ }).first().click()
    await pane.getByLabel("開始日").first().fill("2020-01-01")
    await expect(page).toHaveURL(/[?&]q=/)
    const url = new URL(page.url())
    expect(url.searchParams.get("q")).toBe("date_published:[2020-01-01 TO *]")
    expect(url.searchParams.get("sort")).toBe("id")
    expect(url.searchParams.get("size")).toBe("50")
    expect(url.searchParams.get("rangeKey")).toBeNull()

    // 直近 N 年は、絶対の日付の下限だけを URL に載せる
    const recent = pane.locator("a[href*='date_published']").first()
    const href = new URL(await recent.getAttribute("href") ?? "", "http://invalid.example")
    expect(href.searchParams.get("q")).toMatch(/^date_published:\[\d{4}-\d{2}-\d{2} TO \*\]$/)

    // 数値: script の無い form と同じ GET を送ると、検索式の URL へリダイレクトする
    const answer = await request.get("/dataset?rangeKey=subject-count&rangeFrom=10&rangeTo=&sort=id", { maxRedirects: 0 })
    expect(answer.status()).toBe(302)
    const to = new URL(answer.headers().location ?? "", "http://invalid.example")
    expect(to.pathname).toBe("/dataset")
    expect(to.searchParams.get("q")).toBe("subject-count:[10 TO *]")
    expect(to.searchParams.get("sort")).toBe("id")
  })

  test("S-EXPORT-03: 書き出しのファイルは BOM で始まるタブ区切りで、数式として読まれる文字で始まる値には ' が付く", async ({ request }) => {
    for (const listing of ["/research", "/dataset"]) {
      const file = await request.get(`${listing}/export?format=tsv`)
      expect(file.status(), listing).toBe(200)
      expect(file.headers()["content-type"], listing).toContain("text/tab-separated-values")
      expect(file.headers()["content-disposition"], listing).toMatch(/^attachment/)
      const bytes = await file.body()
      expect([...bytes.subarray(0, 3)], listing).toEqual([0xEF, 0xBB, 0xBF])

      const cells = bytes.subarray(3).toString("utf8").split("\n").filter((line) => line !== "")
        .flatMap((line) => line.split("\t"))
      expect(cells.filter((cell) => /^[=+\-@]/.test(cell)), listing).toEqual([])

      // クリップボードへのコピーには BOM を付けない
      const copied = await (await request.get(`${listing}/export?format=copy`)).body()
      expect(copied[0], listing).not.toBe(0xEF)
    }
  })
})
