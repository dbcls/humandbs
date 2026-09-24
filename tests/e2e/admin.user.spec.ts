import { expect, test, type Page } from "@playwright/test"

import { SIGNED_IN } from "../../playwright.config"

/**
 * The management area as a curator moves through it.
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

  /** The addresses that need no identity: each is under one of the sections. */
  const STANDALONE = [
    "/admin/research",
    "/admin/research/upstream",
    "/admin/experiment-fields",
    "/admin/documents",
    "/admin/alert",
    "/admin/news",
    "/admin/files",
    "/admin/assistant",
  ]

  test("S-ADMIN-01: 区画のトップから、識別子を要らない画面すべてに行ける", async ({ page }) => {
    await page.goto("/admin")
    await expect(page.getByRole("heading", { level: 1, name: "トップ" })).toBeVisible()

    // ページの頭のバーではなく、ページの中身を見る。バーは同じ 8 つを持つので、
    // そちらを数えるとトップが空でも通ってしまう。
    const top = page.getByRole("main")
    for (const path of STANDALONE) {
      await expect(top.locator(`a[href="${path}"]`).first(), path).toBeVisible()
    }

    // 押せるものは行き先とは限らない。研究を始める 3 通りのうち 1 つは操作で、
    // リンクだけを数えると 2 通りに見える。
    await expect(top.getByRole("button", { name: "研究の作成" })).toBeVisible()

    // 行き先はリンクであって、説明の文ではない。1 つ押して、その先が開くことまで見る。
    await top.locator("a[href=\"/admin/experiment-fields\"]").first().click()
    await expect(page).toHaveURL(/\/admin\/experiment-fields$/)
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty()
  })

  test("S-ADMIN-02: 管理画面はパンくずが無く、1 段ずつ親へ戻る", async ({ page }) => {
    // バーが開ける画面は、区画の中の位置を自分では示さない。
    for (const path of [...STANDALONE, "/admin"]) {
      await page.goto(path)
      await expect(page.getByRole("navigation", { name: "現在地" }), path).toHaveCount(0)
    }

    // いちばん深いところからは、1 段ずつ親へ。下書きのどの画面も研究の画面が親で、
    // 研究の内容 → 研究の編集 → 研究一覧。データセットの一覧からも同じ 1 本。
    const draft = await openADraft(page)
    const research = draft.replace(/\/draft\/[0-9a-f-]{36}$/, "")

    await page.goto(`${draft}/dataset`)
    await page.getByRole("link", { name: "研究の編集へ" }).click()
    await expect(page).toHaveURL(research)

    await page.goto(draft)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^研究の内容/)
    // 戻る経路の語は行き先の h1 に「へ」を付けたもの。語だけ直して h1 を直さない (または逆) と、ここで割れる。
    await page.getByRole("link", { name: "研究の編集へ" }).click()
    await expect(page).toHaveURL(research)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^研究の編集/)

    await page.getByRole("link", { name: "研究へ", exact: true }).click()
    await expect(page).toHaveURL("/admin/research")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^研究$/)
  })

  test("S-ADMIN-03: 一覧の件数は「範囲 / 総数」の 1 形で、ページ送りと同じ枠の中にある", async ({ page }) => {
    for (const path of ["/admin/research", "/admin/news"]) {
      await page.goto(path)
      const counted = page.getByText(/^\d+–\d+ \/ \d+ 件$/)
      await expect(counted.first(), path).toBeVisible()

      // ページ送りは件数と同じ枠の中。離れた位置にあると、どちらがどの表のものか読めない。
      const box = counted.first().locator("..")
      await expect(box.getByRole("navigation", { name: /ページ|Pagination/ }), path).toBeVisible()
    }
  })

  test("S-ADMIN-04: 絞り込んで 0 件になっても、表と列の名前は残る", async ({ page }) => {
    await page.goto("/admin/research?q=zzzzzzzzzzzz")
    await expect(page.getByRole("table")).toBeVisible()
    // 列の名前が残っているから、何を探していたのかが分かる。
    await expect(page.getByRole("columnheader").first()).toBeVisible()
    // 件数は表の上と下に 1 つずつ置かれるので、見るのは先に来るほう。
    await expect(page.getByText("0 件").first()).toBeVisible()
  })

  /**
   * **表の上にはツールバーが 1 本、表の下には件数とページ送りだけ。** 表の下端まで読んだ人が探すのは
   * 次のページで、並び替えと表示件数は押すと 1 ページ目の頭に戻す — 下に置くと、読み終えた位置に
   * 先頭へ飛ぶ操作が 2 つ並ぶ。上だけに置くと下端で行き止まりになる。
   *
   * **ページに切る一覧はどれも表示件数があり、記事を除いて並び替えもある。** 記事だけは slug 順に
   * 並ぶことで木になるので、並びを選ばせない。研究は識別子を要るので、下書きから辿った研究で見る。
   * データ提供申請の枝番は申請管理システムに繋がっていない環境では表が無いので、ここでは数えない
   * (同じ `RefinableList` を通る)。
   */
  test("S-ADMIN-06: ページに切る一覧は、並び替えと表示件数を表の上に 1 つずつ、件数を上下に備える", async ({ page }) => {
    const draft = await openADraft(page)
    const research = draft.replace(/\/draft\/[0-9a-f-]{36}$/, "")
    const BOTH = ["並び替え", "表示件数"]
    const listings: [string, string[]][] = [
      ["/admin/research", BOTH],
      ["/admin/news", BOTH],
      ["/admin/documents", ["表示件数"]],
      ["/admin/files", BOTH],
      [`${research}/files`, BOTH],
      ["/admin/experiment-fields/experimental-method", BOTH],
    ]
    for (const [path, offered] of listings) {
      await page.goto(path)
      const main = page.getByRole("main")
      const table = await main.locator("table").first().boundingBox()
      expect(table, path).not.toBeNull()

      for (const name of BOTH) {
        const chooser = main.locator(`summary[aria-label^="${name}:"]`)
        await expect(chooser, `${path} ${name}`).toHaveCount(offered.includes(name) ? 1 : 0)
        if (!offered.includes(name)) continue
        const box = await chooser.boundingBox()
        expect((box?.y ?? Infinity) + (box?.height ?? 0), `${path} ${name}`)
          .toBeLessThanOrEqual(table?.y ?? 0)
      }

      // 件数は 1 ページに収まる一覧でも表示されるので、ページ送りの番号ではなくこちらを数える。
      const counted = main.getByText(/^(\d+–\d+ \/ \d+ 件|0 件)$/)
      await expect(counted, path).toHaveCount(2)
      const under = await counted.last().boundingBox()
      expect(under?.y ?? 0, path).toBeGreaterThanOrEqual((table?.y ?? 0) + (table?.height ?? 0))
    }
  })

  /**
   * **識別子を要る 11 画面。** 地図が並べられるのは残りの 8 つだけなので、ここが「19 画面すべてに
   * 行ける」の後半になる。**アドレスを組み立てず、リンクを辿って着く** — 辿れることが確かめたい
   * ことで、アドレスの形は別の話。
   */
  test("S-ADMIN-05: 一覧から 1 件選んだ先の画面すべてに、リンクを辿って着ける", async ({ page }) => {
    const draft = await openADraft(page)
    // 研究 → 下書き → データセット一覧 → データセット 1 件。上流の 2 つは
    // S-ADMIN-01 が区画のトップから、公開とレビューはここで。
    for (const path of [draft, `${draft}/review`, `${draft}/publish`, `${draft}/dataset`]) {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 }), path).not.toBeEmpty()
    }

    await page.goto(`${draft}/dataset`)
    // 外部アクセッションからの取り込みは同じ前置きのアドレスを持つので、それだけ外す。
    const datasets = page.locator(`a[href^="${draft}/dataset/"]:not([href$="/upstream"])`)
    if (await datasets.count() === 0) {
      // 作ると、そのデータセットの編集画面にそのまま着く。
      await page.getByRole("button", { name: "データセットの作成" }).click()
    } else {
      await datasets.first().click()
    }
    await expect(page).toHaveURL(new RegExp(`${draft}/dataset/[0-9a-f-]{36}$`))
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty()

    // 研究、文書 1 件、お知らせ 1 件、key の値 1 つ。どれも一覧から辿る。
    const research = draft.replace(/\/draft\/.*$/, "")
    await page.goto(research)
    await page.locator(`a[href="${research}/files"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`${research}/files$`))

    // バージョンの無い記事は identity がそのままアドレスなので、その prefix は
    // 系列のものも拾う。系列のほうを除いて選ぶ。
    for (const [listing, prefix, apart] of [
      ["/admin/documents", "/admin/documents/", ":not([href*='/series/'])"],
      ["/admin/documents", "/admin/documents/series/", ""],
      ["/admin/news", "/admin/news/", ""],
    ] as const) {
      await page.goto(listing)
      await page.locator(`a[href^="${prefix}"]${apart}`).first().click()
      await expect(page, listing).toHaveURL(new RegExp(prefix.replaceAll("/", "\\/")))
      await expect(page.getByRole("heading", { level: 1 }), listing).not.toBeEmpty()
    }

    // key の値は、その key を開いた先にある。値を持つ key の行がその件数を
    // リンクにしているので、表の中からそのまま辿れる。
    await page.goto("/admin/experiment-fields")
    await page
      .getByRole("table")
      .locator("a[href^=\"/admin/experiment-fields/\"]")
      .first()
      .click()
    await expect(page).toHaveURL(/\/admin\/experiment-fields\/[^/]+$/)
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty()
  })

  test("S-ADMIN-07: 公開ページの pane で一覧の cell を押すと、編集 pane のその要素の行に着き、行が pane の中に見える", async ({ page }) => {
    await page.goto(await openADraft(page))
    // The last element of any list: the row the form has to move furthest for.
    const cells = page.locator(
      "[data-place^='grants.'], [data-place^='relatedPublications.'], [data-place^='researchProjects.'], [data-place^='dataProviders.']",
    )
    test.skip(await cells.count() === 0, "この下書きは繰り返しの要素を持たない")
    const cell = cells.last()
    const at = await cell.getAttribute("data-place") ?? ""
    const element = at.split(".").slice(0, 2).join(".")

    await cell.scrollIntoViewIfNeeded()
    await cell.click()

    const row = page.locator(`tr[data-at="${element}"]`)
    await expect(row).toHaveAttribute("data-landed", "")
    const pane = page.locator("[data-pane-body]").first()
    const [rowBox, paneBox] = await Promise.all([row.boundingBox(), pane.boundingBox()])
    expect(rowBox).not.toBeNull()
    expect(paneBox).not.toBeNull()
    if (rowBox === null || paneBox === null) return
    expect(rowBox.y).toBeGreaterThanOrEqual(paneBox.y)
    expect(rowBox.y + Math.min(rowBox.height, 36)).toBeLessThanOrEqual(paneBox.y + paneBox.height)
    // The keyboard lands on the same row: its first control opens the element.
    await expect(row.getByRole("button").first()).toBeFocused()
  })

  test("S-ADMIN-08: 両方の pane が公開ページのとき、値を押してもどちらの pane も動かない", async ({ page }) => {
    await page.goto(await openADraft(page))
    // The form's pane takes a page instead, so no pane holds the form.
    await page.getByRole("tablist").first().getByRole("tab", { name: "公開ページ en" }).click()
    const panes = page.locator("[data-pane-body]")
    await expect(panes.first().locator("form, input, textarea")).toHaveCount(0)
    const cells = panes.nth(1).locator("[data-place]")
    test.skip(await cells.count() < 2, "この下書きは押せる値をほとんど持たない")
    const before = await panes.evaluateAll((all) => all.map((one) => one.scrollTop))

    await cells.nth(1).click({ position: { x: 4, y: 4 } })

    await expect.poll(() => panes.evaluateAll((all) => all.map((one) => one.scrollTop))).toEqual(before)
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
    await page.getByRole("button", { name: "空の下書き" }).click()
    await expect(page.locator(`a[href^="${research}/draft/"]`).first()).toBeVisible()
  }
  const href = await page.locator(`a[href^="${research}/draft/"]`).first().getAttribute("href")
  return (href ?? "").replace(/\/(publish|review|dataset)$/, "")
}
