import { expect } from "@playwright/test"

import { EXPECTED, NON_ADMIN, SIGNED_IN, sessionState } from "../../playwright.config"
import { discardDraft, discardLeftoverInvitations, e2eResearch, invitationRows, makeDraft, test } from "./_admin"
import { openScreen } from "./_screen"

/**
 * The management area as a curator moves through it.
 *
 * **These do not publish.** The instance holds one set of rows and a
 * scenario that put a version out would change what every other scenario is
 * looking at — so what is checked here is that the nineteen screens can be
 * reached and that they show how much they are showing. The one thing written
 * is a draft of their own (`sharedDraft`), which a reader cannot see.
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

  test("S-ADMIN-01: 管理トップから、識別子を要らない画面すべてに行ける", async ({ page }) => {
    await openScreen(page, "/admin")
    await expect(page.getByRole("heading", { level: 1, name: "トップ" })).toBeVisible()

    // ページ上部のバーではなく、ページの中身を見る。バーにも同じ 8 つがあるので、
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

  test("S-ADMIN-02: 管理画面はパンくずが無く、1 階層ずつ親へ戻る", async ({ page, sharedDraft }) => {
    // バーから開ける画面は、管理画面の中の位置を自分では示さない。
    for (const path of [...STANDALONE, "/admin"]) {
      await page.goto(path)
      await expect(page.getByRole("navigation", { name: "現在地" }), path).toHaveCount(0)
    }

    // いちばん深いところからは、1 階層ずつ親へ。データセット一覧 → 研究の編集 (下書き) → 研究 → 研究一覧。
    // 戻る経路の語は行き先の h1 に「へ」を付けたもの。語だけ直して h1 を直さない (または逆) と、ここで失敗する。
    const { path: draft, research } = sharedDraft

    // 下書きの画面から開いたデータセット一覧は、その下書きへ戻る
    await openScreen(page, draft)
    await page.locator(`a[href="${draft}/dataset"]`).first().click()
    await expect(page).toHaveURL(`${draft}/dataset`)
    await page.getByRole("link", { name: "研究の編集へ", exact: true }).click()
    await expect(page).toHaveURL(draft)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^研究の編集/)

    await page.getByRole("link", { name: "研究へ", exact: true }).click()
    await expect(page).toHaveURL(research)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^研究$/)

    await page.getByRole("link", { name: "研究一覧へ", exact: true }).click()
    await expect(page).toHaveURL("/admin/research")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^研究一覧$/)

    // ほかの画面から直接開いたデータセット一覧は、研究へ戻る
    await page.goto(`${draft}/dataset`)
    await page.getByRole("link", { name: "研究へ", exact: true }).click()
    await expect(page).toHaveURL(research)
  })

  test("S-ADMIN-03: 一覧の件数は「範囲 / 総数」の 1 形で、ページ送りと同じ要素の中にある", async ({ page }) => {
    for (const path of ["/admin/research", "/admin/news"]) {
      await page.goto(path)
      const counted = page.getByText(/^\d+–\d+ \/ \d+ 件$/)
      await expect(counted.first(), path).toBeVisible()

      // ページ送りは件数と同じ要素の中。離れた位置にあると、どちらがどの表のものか読めない。
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
  test("S-ADMIN-06: ページに切る一覧は、並び替えと表示件数を表の上に 1 つずつ、件数を上と下に表示する", async ({ page, sharedDraft }) => {
    const { research } = sharedDraft
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
      // 表のセルにも「0 件」があるので、表の外の段落だけを数える。
      const counted = main.locator("p").filter({ hasText: /^(\d+–\d+ \/ \d+ 件|0 件)$/ })
      await expect(counted, path).toHaveCount(2)
      const under = await counted.last().boundingBox()
      expect(under?.y ?? 0, path).toBeGreaterThanOrEqual((table?.y ?? 0) + (table?.height ?? 0))
    }
  })

  /**
   * **識別子を要る 11 画面。** 管理トップのリンクで並べられるのは残りの 8 つだけなので、ここが「19 画面すべてに
   * 行ける」の後半になる。**アドレスを組み立てず、リンクを辿って着く** — 辿れることが確かめたい
   * ことで、アドレスの形は別の話。
   */
  test("S-ADMIN-05: 一覧から 1 件選んだ先の画面すべてに、リンクを辿って着ける", async ({ page, sharedDraft }) => {
    const { path: draft, research } = sharedDraft
    // 研究 → 下書き → データセット一覧 → データセット 1 件。上流の 2 つは
    // S-ADMIN-01 が管理トップから、公開とレビューはここで。
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

  test("S-ADMIN-07: 公開ページの pane で一覧の cell を押すと、編集 pane のその要素の行に着き、行が pane の中に見える", async ({ page, sharedDraft }) => {
    await openScreen(page, sharedDraft.path)
    // The last element of any list: the row the form has to move furthest for.
    // A value with a link in it (a published dataset's ID) opens that page instead.
    const cells = page.locator(
      "[data-field-path^='grants.'], [data-field-path^='relatedPublications.'], [data-field-path^='researchProjects.'], [data-field-path^='dataProviders.']",
    ).filter({ hasNot: page.locator("a") })
    test.skip(await cells.count() === 0, "この下書きには繰り返しの要素が無い")
    const cell = cells.last()
    const at = await cell.getAttribute("data-field-path") ?? ""
    const element = at.split(".").slice(0, 2).join(".")

    await cell.scrollIntoViewIfNeeded()
    await cell.click()

    const row = page.locator(`tr[data-at="${element}"]`)
    await expect(row).toHaveAttribute("data-highlighted", "")
    const pane = page.locator("[data-pane-body]").first()
    const [rowRect, paneRect] = await Promise.all([row.boundingBox(), pane.boundingBox()])
    expect(rowRect).not.toBeNull()
    expect(paneRect).not.toBeNull()
    if (rowRect === null || paneRect === null) return
    expect(rowRect.y).toBeGreaterThanOrEqual(paneRect.y)
    expect(rowRect.y + Math.min(rowRect.height, 36)).toBeLessThanOrEqual(paneRect.y + paneRect.height)
    // The keyboard lands on the same row: its first control opens the element.
    await expect(row.getByRole("button").first()).toBeFocused()
  })

  test("S-ADMIN-08: 両方の pane が公開ページのとき、値を押してもどちらの pane も動かない", async ({ page, sharedDraft }) => {
    await openScreen(page, sharedDraft.path)
    // The form's pane takes a page instead, so no pane holds the form.
    await page.getByRole("tablist").first().getByRole("tab", { name: "公開ページ en" }).click()
    const panes = page.locator("[data-pane-body]")
    await expect(panes.first().locator("form, input, textarea")).toHaveCount(0)
    const cells = panes.nth(1).locator("[data-field-path]")
    test.skip(await cells.count() < 2, "この下書きには押せる値が 2 つ未満しか無い")
    const before = await panes.evaluateAll((all) => all.map((one) => one.scrollTop))

    await cells.nth(1).click({ position: { x: 4, y: 4 } })

    await expect.poll(() => panes.evaluateAll((all) => all.map((one) => one.scrollTop))).toEqual(before)
  })

  test("S-ADMIN-09: admin でない人は /admin で自分の sub だけを見て、ほかの管理画面は 403 になる", async ({ browser, playwright }) => {
    test.skip(NON_ADMIN === "", "HUMANDBS_E2E_NON_ADMIN_SESSION が無い (npm run e2e:session -- non-admin)")
    const baseURL = test.info().project.use.baseURL
    const context = await browser.newContext({ baseURL, storageState: sessionState(NON_ADMIN) })
    const page = await context.newPage()
    await page.goto("/admin")
    await expect(page.getByText("この画面を操作する権限がありません。")).toBeVisible()
    await expect(page.getByText("e2e-non-admin", { exact: true })).toBeVisible()
    // 管理者の一覧・操作の記録・アプリのバージョンは表示しない
    for (const heading of ["操作の記録", "招待リンク", "外部データの取り込み状況"]) {
      await expect(page.getByRole("heading", { name: heading }), heading).toHaveCount(0)
    }
    await expect(page.getByText("アプリのバージョン")).toHaveCount(0)
    await context.close()

    const request = await playwright.request.newContext({ baseURL, storageState: sessionState(NON_ADMIN) })
    for (const path of STANDALONE) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(403)
    }
    await request.dispose()
  })

  test("S-ADMIN-10: 操作の記録を操作・操作者・日付で絞り込め、上流の取得の状態とアプリのバージョンがトップにある", async ({ page }) => {
    // 絞り込む記録を 1 つ作る。回す先によっては、e2e curator の下書きの削除がまだ無い
    await discardDraft(page, await makeDraft(page))
    await page.goto("/admin")
    await expect(page.getByRole("heading", { name: "外部データの取り込み状況" })).toBeVisible()
    const version = page.getByText("アプリのバージョン").locator("xpath=following::code[1]")
    if (EXPECTED.version !== "") await expect(version).toHaveText(EXPECTED.version)

    const events = page.getByRole("heading", { name: "操作の記録" }).locator("xpath=ancestor::section[1]")
    const rows = events.getByRole("table").getByRole("row")
    // URL が変わってから表が入れ替わるまで待って、すべての行が条件に合うことを見る
    const allRows = (word: string) => expect.poll(async () => (await rows.allInnerTexts()).slice(1)
      .every((row) => row.includes(word) || row.includes("条件に合う記録はありません。")))
    // 操作
    await page.waitForLoadState("networkidle")
    await events.getByRole("checkbox", { name: /^下書きの削除/ }).check()
    await expect(page).toHaveURL(/[?&]action=discard-draft(&|$)/)
    await allRows("下書きの削除").toBe(true)
    // 操作者
    await events.getByRole("checkbox", { name: /^e2e curator/ }).check()
    await expect(page).toHaveURL(/[?&]actor=e2e-curator(&|$)/)
    await allRows("e2e curator").toBe(true)
    // 日付: 今日から
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
    await events.getByLabel("開始日").fill(today)
    await expect(page).toHaveURL(new RegExp(`[?&]from=${today}(&|$)`))
    expect(new URL(page.url()).searchParams.getAll("action")).toEqual(["discard-draft"])
  })

  test("S-INVITE-01: 招待リンクを作るとトップの一覧に表示され、開かずに削除できる", async ({ page }) => {
    await page.goto("/admin")
    const mine = invitationRows(page).filter({ hasText: "e2e curator" })
    const before = await mine.count()

    await page.getByRole("button", { name: "招待リンクの作成" }).click()
    await expect(page.getByText("招待リンクを作成しました。リンクはこの画面を離れると表示できません。")).toBeVisible()
    await expect(mine).toHaveCount(before + 1)

    await discardLeftoverInvitations(page)
    await expect(mine).toHaveCount(0)
  })

  /**
   * **ページを表示する route の Origin の食い違いは、React Router 自身の検査が先に 400 を返す。**
   * アプリの検査 (`app/auth/csrf.ts`) はそのほかを 403 にする。どちらも書き込みはしない。
   */
  test("S-CSRF-01: 別の origin からの書き込みの要求は拒否され、同じ origin からは拒否されない", async ({ page, request }) => {
    const origin = new URL(test.info().project.use.baseURL ?? "").origin
    const research = await e2eResearch(page)
    // ページを表示する route と、データだけを返す route (アップロードの署名)
    for (const [path, isPage] of [["/admin", true], [`${research}/files/upload`, false]] as const) {
      for (const [who, headers, status] of [
        ["別のホスト", { Origin: "https://elsewhere.example" }, isPage ? 400 : 403],
        ["null", { Origin: "null" }, isPage ? 400 : 403],
        ["別のサイトからの fetch", { "Sec-Fetch-Site": "cross-site" }, 403],
        ["どちらのヘッダも無い", {}, 403],
      ] as const) {
        const answer = await request.post(path, { form: { intent: "no-such-intent" }, headers, maxRedirects: 0 })
        expect.soft(answer.status(), `${path} ${who}`).toBe(status)
      }
      const same = await request.post(path, { form: { intent: "no-such-intent" }, headers: { Origin: origin }, maxRedirects: 0 })
      expect(same.status(), path).not.toBe(403)
    }
  })
})
