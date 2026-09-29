import { expect, test } from "@playwright/test"

import { datasetWithFilePages } from "./_instance"

/**
 * The unrestricted-access files a reader downloads from a dataset's page.
 *
 * **The section is in the middle of a long page**, so moving through it must
 * not move the page or pile up history; and the list of addresses is what a
 * reader hands to `wget -i`, so each line has to be one that downloads.
 */
test.describe("P-ANON 非制限公開ファイル", () => {
  test("S-FILE-01: 節のページ送りと表示件数はスクロールの位置を変えず、履歴を積まない", async ({ page, request }) => {
    const dataset = await datasetWithFilePages(request)
    test.skip(dataset === null, "非制限公開ファイルが 20 件を超えるデータセットが無い")
    if (dataset === null) return

    await page.goto(`/dataset/${dataset.id}`)
    await page.waitForLoadState("networkidle")
    const section = page.getByRole("heading", { name: "非制限公開ファイル" }).locator("xpath=ancestor::section[1]")
    const where = async () => await page.evaluate(() => ({ y: window.scrollY, history: window.history.length }))
    // 押すものを先に画面に入れてから測る。Playwright は押す前に要素までスクロールする
    const next = section.getByRole("navigation", { name: "ページ送り" }).first().getByRole("link", { name: "次へ" })
    await next.scrollIntoViewIfNeeded()
    const before = await where()

    await next.click()
    await expect(page).toHaveURL(/[?&]files=2(&|$)/)
    const paged = await where()
    expect(paged.history).toBe(before.history)
    expect(Math.abs(paged.y - before.y)).toBeLessThan(2)

    const size = section.locator("summary[aria-label^=\"表示件数:\"]")
    await size.scrollIntoViewIfNeeded()
    await size.click()
    // 開いたメニューの選択肢が画面の下にはみ出ることがあるので、これも先に画面に入れてから測る
    const fifty = section.getByRole("link", { name: "50", exact: true })
    await fifty.scrollIntoViewIfNeeded()
    const opened = await where()
    await fifty.click()
    await expect(page).toHaveURL(/[?&]fileRows=50(&|$)/)
    // 件数を選ぶと 1 ページ目に戻る
    expect(new URL(page.url()).searchParams.get("files") ?? "1").toBe("1")
    const sized = await where()
    expect(sized.history).toBe(before.history)
    expect(Math.abs(sized.y - opened.y)).toBeLessThan(2)
  })

  test("S-FILE-02: URL の一覧は 1 行に 1 つ節のすべてのファイルの URL を返し、各 URL からダウンロードできる", async ({ request }) => {
    const dataset = await datasetWithFilePages(request, 0)
    test.skip(dataset === null, "非制限公開ファイルのあるデータセットが無い")
    if (dataset === null) return

    const list = await request.get(`/dataset/${dataset.id}/files.txt`)
    expect(list.status()).toBe(200)
    expect(list.headers()["content-type"]).toContain("text/plain")
    expect(list.headers()["content-disposition"]).toMatch(/^attachment/)
    expect(list.headers()["x-content-type-options"]).toBe("nosniff")
    const urls = (await list.text()).split("\n").filter((line) => line !== "")
    expect(urls).toHaveLength(dataset.files)
    for (const url of urls) expect(new URL(url).pathname).toMatch(/^\/files\/hum\d{4}\//)

    // 小さいものを 1 つ取る。画像 (SVG を除く) と PDF のほかは、開かずに保存させる
    const { files } = await (await request.get(`/api/dataset/${dataset.id}?includeFiles=true`)).json() as {
      files: { size: number, url: string }[]
    }
    const smallest = [...files].sort((a, b) => a.size - b.size)[0]
    const file = await request.get(new URL(smallest?.url ?? "").pathname)
    expect(file.status()).toBe(200)
    expect(file.headers()["x-content-type-options"]).toBe("nosniff")
    const type = file.headers()["content-type"] ?? ""
    const inline = (type.startsWith("image/") && !type.startsWith("image/svg")) || type.startsWith("application/pdf")
    expect(file.headers()["content-disposition"] ?? "", type).toMatch(inline ? /^(?!attachment)/ : /^attachment/)
    expect((await file.body()).length).toBe(smallest?.size)
  })

  test("S-FILE-03: 無いファイルの URL はダウンロードさせずに 404 のページを表示する", async ({ page }) => {
    const response = await page.goto("/files/common/e2e-no-such-file.zip")
    expect(response?.status()).toBe(404)
    expect(response?.headers()["content-disposition"]).toBeUndefined()
    await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible()
  })
})
