import { expect, test } from "@playwright/test"

/**
 * What an anonymous reader can reach (`docs/testing.md` の P-ANON).
 *
 * **The scenarios take the labels from the instance rather than naming them.**
 * These run against whatever is deployed — the compose in this repo, or
 * staging — and a research id written here would tie them to one set of rows.
 */
test.describe("P-ANON", () => {
  test("S-PUB-01: 一覧から研究・版の一覧・データセットまで辿れる", async ({ page }) => {
    await page.goto("/research")
    await expect(page.getByRole("heading", { level: 1, name: "研究一覧" })).toBeVisible()

    const row = page.getByRole("link", { name: /^hum\d+$/ }).first()
    const humLabel = (await row.innerText()).trim()
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/research/${humLabel}$`))
    await expect(page.getByRole("heading", { level: 1 })).toContainText(humLabel)

    // 版の一覧はこの画面から行ける
    await page.locator(`a[href="/research/${humLabel}/versions"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`/research/${humLabel}/versions$`))
    const version = page.locator(`a[href^="/research/${humLabel}/v"]`).first()
    await expect(version).toBeVisible()

    // 研究に属するデータセット
    await page.goto(`/research/${humLabel}`)
    const dataset = page.getByRole("link", { name: /^(JGAD|hum)\S+$/ })
      .filter({ hasNotText: humLabel }).first()
    if (await dataset.count() === 0) test.skip(true, "この研究は公開データセットを持たない")
    const datasetLabel = (await dataset.innerText()).trim()
    await dataset.click()
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetLabel}$`))
    await expect(page.getByRole("heading", { level: 1 })).toContainText(datasetLabel)
  })

  test("S-PUB-02: 版を書かない研究のアドレスが最新の公開版を出す", async ({ page, request }) => {
    const listing = await (await request.get("/api/research?size=1")).json() as {
      hits: { id: string }[]
    }
    const humLabel = listing.hits[0]?.id ?? ""
    expect(humLabel).toMatch(/^hum\d+$/)

    const bare = await (await request.get(`/api/research/${humLabel}`)).json() as {
      version: number
      url: string
      versions: { version: number }[]
    }
    const newest = Math.max(...bare.versions.map((one) => one.version))
    expect(bare.version).toBe(newest)
    // 答えが名乗るアドレスは版を書いたほう。裸のアドレスは入口であって、
    // 機械に渡すときの名前ではない
    expect(new URL(bare.url).pathname).toBe(`/research/${humLabel}/v${newest}`)

    // 画面も同じ版を出す — 見出しが名乗るのは解決した先の版
    await page.goto(`/research/${humLabel}`)
    await expect(page.getByRole("heading", { level: 1 }))
      .toContainText(`${humLabel}-v${newest}`)
  })

  test.describe("JS を実行しないクライアント", () => {
    test.use({ javaScriptEnabled: false })

    test("S-PUB-03: 裸の研究アドレスと一覧が script なしでも読める", async ({ page }) => {
      await page.goto("/research")
      await expect(page.getByRole("heading", { level: 1, name: "研究一覧" })).toBeVisible()

      const humLabel = (await page.getByRole("link", { name: /^hum\d+$/ }).first().innerText()).trim()
      await page.goto(`/research/${humLabel}`)
      await expect(page.getByRole("heading", { level: 1 })).toContainText(humLabel)
    })
  })

  test("S-PUB-04: 公開されていないものと存在しないラベルが同じ 404 になる", async ({ request }) => {
    for (const path of ["/research/hum9999999", "/dataset/JGAD9999999"]) {
      expect((await request.get(path)).status(), path).toBe(404)
      expect((await request.get(`/api${path}`)).status(), `/api${path}`).toBe(404)
    }
  })

  test("S-PUB-05: 版番号を持たない document の slug が応答する", async ({ page }) => {
    await page.goto("/")
    const slug = await page.locator("a[href=\"/aim\"]").first().getAttribute("href")
    expect(slug).toBe("/aim")
    await page.goto("/aim")
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty()
  })
})
