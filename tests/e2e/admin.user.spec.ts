import { expect, test, type Page } from "@playwright/test"

import { SIGNED_IN } from "../../playwright.config"

/**
 * The management area as a curator moves through it (`docs/testing.md` の
 * P-ADMIN).
 *
 * **These read; they do not publish.** The instance holds one set of rows and a
 * scenario that put a version out would change what every other scenario is
 * looking at — so what is checked here is that the nineteen screens can be
 * reached and that they say how much they are showing, which is what U8 settled.
 *
 * **The labels are taken from the instance rather than named.** These run
 * against the compose in this repo and against staging, and a research id
 * written here would tie them to one set of rows.
 */
test.describe("P-ADMIN", () => {
  test.skip(SIGNED_IN === "", "HUMANDBS_E2E_SESSION が無い (npm run e2e:session)")

  /** The addresses that need no identity: the map has to offer all of them. */
  const STANDALONE = [
    "/admin/research",
    "/admin/research/upstream",
    "/admin/experiment-fields",
    "/admin/contents",
    "/admin/contents/news",
    "/admin/contents/files",
    "/admin/assistant",
  ]

  test("S-ADMIN-01: 区画のトップから、識別子を要らない画面すべてに行ける", async ({ page }) => {
    await page.goto("/admin")
    await expect(page.getByRole("heading", { level: 1, name: "管理" })).toBeVisible()

    // 窓の端のつまみではなく、ページの中の地図を見る。つまみは畳まれていて
    // 同じ行き先を持つので、そちらを数えると地図が空でも通ってしまう。
    const map = page.getByRole("main")
    for (const path of STANDALONE) {
      await expect(map.locator(`a[href="${path}"]`).first(), path).toBeVisible()
    }

    // 行き先はリンクであって、説明の文ではない。1 つ押して、その先が開くことまで見る。
    await map.locator("a[href=\"/admin/experiment-fields\"]").first().click()
    await expect(page).toHaveURL(/\/admin\/experiment-fields$/)
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty()
  })

  test("S-ADMIN-02: どの管理画面からもパンくずで区画のトップに戻れる", async ({ page }) => {
    for (const path of [...STANDALONE, "/admin"]) {
      await page.goto(path)
      const trail = page.getByRole("navigation", { name: "現在地" })
      await expect(trail, path).toBeVisible()
      if (path === "/admin") continue
      await expect(trail.locator("a[href=\"/admin\"]"), path).toBeVisible()
    }

    // いちばん深いところからも同じこと。研究 → 下書き → データセット一覧。
    const draft = await openADraft(page)
    await page.goto(`${draft}/dataset`)
    const trail = page.getByRole("navigation", { name: "現在地" })
    await expect(trail.locator("a[href=\"/admin\"]")).toBeVisible()
    await trail.locator("a[href=\"/admin\"]").click()
    await expect(page).toHaveURL(/\/admin$/)
  })

  test("S-ADMIN-03: 一覧の件数は「範囲 / 総数」の 1 形で、ページ送りと同じ器に立つ", async ({ page }) => {
    for (const path of ["/admin/research", "/admin/contents/news"]) {
      await page.goto(path)
      const counted = page.getByText(/^\d+–\d+ \/ \d+ 件$/)
      await expect(counted.first(), path).toBeVisible()

      // ページ送りは件数と同じ器の中。離れていたのが U8 の入力そのものだった。
      const box = counted.first().locator("..")
      await expect(box.getByRole("navigation", { name: /ページ|Pagination/ }), path).toBeVisible()
    }
  })

  test("S-ADMIN-04: 絞り込んで 0 件になっても、表と列の名前は残る", async ({ page }) => {
    await page.goto("/admin/research?q=zzzzzzzzzzzz")
    await expect(page.getByRole("table")).toBeVisible()
    // 列の名前が残っているから、何を探していたのかが分かる。
    await expect(page.getByRole("columnheader").first()).toBeVisible()
    await expect(page.getByText("0 件")).toBeVisible()
  })

  /**
   * **識別子を要る 11 画面。** 地図が並べられるのは残りの 8 つだけなので、ここが「19 画面すべてに
   * 行ける」の後半になる。**アドレスを組み立てず、リンクを辿って着く** — 辿れることが確かめたい
   * ことで、アドレスの形は別の話。
   */
  test("S-ADMIN-05: 一覧から 1 件選んだ先の画面すべてに、リンクを辿って着ける", async ({ page }) => {
    const draft = await openADraft(page)
    // 研究 → 下書き → データセット一覧 → データセット 1 件。上流の 2 つは
    // S-ADMIN-01 が地図から、公開とレビューはここで。
    for (const path of [draft, `${draft}/review`, `${draft}/publish`, `${draft}/dataset`]) {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 }), path).not.toBeEmpty()
    }

    await page.goto(`${draft}/dataset`)
    const dataset = page.locator(`a[href^="${draft}/dataset/"]`)
      .filter({ hasNotText: "上流" }).first()
    if (await dataset.count() === 0) {
      await page.getByRole("button", { name: "新しいデータセットを作る" }).click()
    }
    await page.locator(`a[href^="${draft}/dataset/"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`${draft}/dataset/[0-9a-f-]{36}$`))
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty()

    // 研究の箱、文書 1 件、お知らせ 1 件、語彙 1 つ。どれも一覧から辿る。
    const research = draft.replace(/\/draft\/.*$/, "")
    await page.goto(research)
    await page.locator(`a[href="${research}/files"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`${research}/files$`))

    for (const [listing, prefix] of [
      ["/admin/contents", "/admin/contents/document/"],
      ["/admin/contents/news", "/admin/contents/news/"],
    ] as const) {
      await page.goto(listing)
      await page.locator(`a[href^="${prefix}"]`).first().click()
      await expect(page, listing).toHaveURL(new RegExp(prefix.replaceAll("/", "\\/")))
      await expect(page.getByRole("heading", { level: 1 }), listing).not.toBeEmpty()
    }

    // 項目の語は、その項目を開いた先にある。行は `<details>` なので、たたまれた
    // ままではリンクを押せない — 語彙を持つ行を 1 つ開いてから辿る。
    await page.goto("/admin/experiment-fields")
    const withTerms = page
      .locator("details")
      .filter({ has: page.locator("a[href^=\"/admin/experiment-fields/\"]") })
      .first()
    await withTerms.locator("summary").click()
    await withTerms.locator("a[href^=\"/admin/experiment-fields/\"]").click()
    await expect(page).toHaveURL(/\/admin\/experiment-fields\/[^/]+$/)
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty()
  })
})

/**
 * The address of a draft on the instance, made if there is not one already.
 *
 * A draft is not published state, so making one changes nothing a reader can
 * see — and the development data arrives with none at all, which is why the
 * scenarios cannot simply look for one.
 */
async function openADraft(page: Page): Promise<string> {
  await page.goto("/admin/research")
  await page.getByRole("table").getByRole("link").first().click()
  await expect(page).toHaveURL(/\/admin\/research\/[0-9a-f-]{36}$/)
  const research = new URL(page.url()).pathname

  const existing = page.locator(`a[href^="${research}/draft/"]`).first()
  if (await existing.count() === 0) {
    await page.getByRole("button", { name: "下書きを作る" }).click()
    await expect(page.locator(`a[href^="${research}/draft/"]`).first()).toBeVisible()
  }
  const href = await page.locator(`a[href^="${research}/draft/"]`).first().getAttribute("href")
  return (href ?? "").replace(/\/(publish|review|dataset)$/, "")
}
