import { expect, type Page } from "@playwright/test"

import { SIGNED_IN } from "../../playwright.config"
import { discardDraft, E2E, makeDraft, test, type Draft } from "./_admin"
import { openScreen } from "./_screen"

/**
 * Writing a draft, as a curator does before a version is published.
 *
 * **Every scenario writes a draft of its own and takes it out**, and none of
 * them presses publish: what they change is what a reader cannot see.
 */
test.describe("P-DRAFT 下書き", () => {
  test.skip(SIGNED_IN === "", "HUMANDBS_E2E_SESSION が無い (npm run e2e:session)")

  test("S-DRAFT-01: 研究の内容を保存すると隣の公開ページに反映され、読み直しても残り、公開ページは変わらない", async ({ page, request }) => {
    await withDraft(page, async (draft) => {
      const humLabel = await humLabelOf(page, draft)
      const published = (await (await request.get(`/api/research/${humLabel}`)).json() as { title: { ja?: string } }).title.ja
      const title = `${E2E} 研究題目 ${Date.now()}`

      await openScreen(page, draft.path)
      await titleInput(page).fill(title)
      // 隣のペインは保存を待たずに、入力中の内容で描き直す
      await expect(page.locator("[data-pane-body]").nth(1).getByText(title)).toBeVisible()
      await saveDraft(page)

      await page.reload()
      await expect(titleInput(page)).toHaveValue(title)
      // 下書きの保存では、公開中のバージョンは変わらない
      const after = (await (await request.get(`/api/research/${humLabel}`)).json() as { title: { ja?: string } }).title.ja
      expect(after).toBe(published)
    })
  })

  test("S-DRAFT-02: 同じ下書きを 2 つのタブで開くと、あとの保存が競合になり、入力が残り、相手の値を取り込める", async ({ page, browser }) => {
    await withDraft(page, async (draft) => {
      const other = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage()
      await openScreen(page, draft.path)
      await openScreen(other, draft.path)

      const first = `${E2E} 先に保存した題目`
      const second = `${E2E} あとから保存した題目`
      await titleInput(other).fill(first)
      await saveDraft(other)

      await titleInput(page).fill(second)
      await saveDraft(page, 409)
      await expect(page.getByText("別の場所で保存されました")).toBeVisible()
      // 変わった項目は、ほかの場所の一覧と同じ名前で並ぶ
      await expect(page.getByRole("link", { name: / \/ 研究題目$/ })).toBeVisible()
      // 手元の入力は消えず、読み直しもしない
      await expect(titleInput(page)).toHaveValue(second)

      // 変わった欄の見出しに相手の値を取り込むボタンがあり、押すとその値になる
      const changed = page.getByRole("heading", { level: 2, name: /^研究題目 別の場所で変更/ })
      await changed.getByRole("button", { name: "取り込み" }).click()
      // 保存済みの値と同じになったので、保存するものは無い
      await expect(titleInput(page)).toHaveValue(first)
      await other.context().close()
    })
  })

  test("S-DRAFT-03: 公開済みのバージョンから取り込むと、違う項目だけが 3 行で表示され、選んだ値で保存される", async ({ page, request }) => {
    await withDraft(page, async (draft) => {
      const humLabel = await humLabelOf(page, draft)
      const { title, version } = await (await request.get(`/api/research/${humLabel}`)).json() as {
        title: { ja?: string }
        version: number
      }
      // 公開中のバージョンのコピーから、研究題目だけを変えておく
      await openScreen(page, draft.path)
      await titleInput(page).fill(`${E2E} 取り込みで戻す題目`)
      await saveDraft(page)

      await openScreen(page, `${draft.path}/import`)
      await page.locator(`a[href$="/import?version=${version}"]`).click()
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^取り込む値の選択/)
      // 違うのは研究題目だけで、現在の下書き・取り込み元・最終的な値の 3 行で表示する
      const main = page.getByRole("main")
      expect(await main.getByRole("heading", { level: 2 }).allInnerTexts()).toEqual(["研究題目"])
      await expect(main.getByText("現在の下書き").first()).toBeVisible()
      await expect(main.getByRole("deletion").first()).toHaveText(`${E2E} 取り込みで戻す題目`)
      await expect(main.getByRole("insertion").first()).toHaveText(title.ja ?? "")
      await expect(main.getByText("最終的な値").first()).toBeVisible()
      await expect(main.getByRole("textbox").first()).toHaveValue(title.ja ?? "")

      await page.getByRole("button", { name: "取り込み", exact: true }).last().click()
      await expect(page).toHaveURL(new RegExp(`${draft.path}$`))
      await expect(titleInput(page)).toHaveValue(title.ja ?? "")
    })
  })

  test("S-DRAFT-05: 公開前の確認の場所の一覧から、編集画面のその欄へ移れる", async ({ page }) => {
    await withDraft(page, async (draft) => {
      await openScreen(page, draft.path)
      await page.locator("[data-at=\"title\"]").first().getByRole("group", { name: "値の扱い" }).first()
        .getByRole("button", { name: "未確定" }).click()
      await saveDraft(page)

      await openScreen(page, `${draft.path}/publish`)
      const row = page.getByRole("row").filter({ hasText: "未確定の値" })
      await expect(row).toContainText("1")
      await row.getByRole("button", { name: "場所の一覧" }).click()
      const spots = page.getByRole("dialog", { name: "未確定の値" })
      await spots.getByRole("link", { name: /研究題目$/ }).click()

      await expect(page).toHaveURL(new RegExp(`${draft.path}#title`))
      await expect(page.locator("[data-at=\"title\"]").first()).toBeInViewport()
      // 公開のボタンは押さない
    })
  })

  test("S-APPLY-01: 申請から研究を作る画面は、研究の無い枝番を選ぶと作成の確認を表示する", async ({ page }) => {
    await openScreen(page, "/admin/research/upstream")
    const branches = page.getByRole("main").locator("a[href^=\"/admin/research/upstream/\"]")
    const hrefs = [...new Set(await branches.evaluateAll((all) => all.map((one) => one.getAttribute("href") ?? "")))]
    test.skip(hrefs.length === 0, "データ提供申請の枝番が無い (申請管理システムに接続していない)")

    for (const href of hrefs.slice(0, 20)) {
      await page.goto(href)
      const creating = page.getByRole("heading", { name: "研究の作成", exact: true })
      if (await creating.count() === 0) continue
      await expect(creating).toBeVisible()
      await expect(page.getByRole("button", { name: /の作成を開始$/ })).toBeEnabled()
      // 作成は押さない
      return
    }
    test.skip(true, "研究の無い枝番が先頭の 20 件に無い")
  })
})

/** The input of the research title in Japanese, in the form pane. */
function titleInput(page: Page) {
  return page.getByRole("textbox", { name: "研究題目 ja", exact: true })
}

/**
 * Saves the draft's form with the toolbar's button, which follows the draft
 * name's, and expects the response to the save to have `status`.
 */
async function saveDraft(page: Page, status = 200): Promise<void> {
  const saved = page.waitForResponse((answer) => answer.request().method() === "POST"
    && /\/draft\/[0-9a-f-]{36}(\.data)?$/.test(new URL(answer.url()).pathname))
  await page.getByRole("button", { name: "保存", exact: true }).last().click()
  expect((await saved).status()).toBe(status)
}

/** The research ID of the draft's research, as its screen shows it. */
async function humLabelOf(page: Page, draft: Draft): Promise<string> {
  await page.goto(draft.research)
  const [label = ""] = /hum\d+/.exec(await page.getByRole("main").innerText()) ?? []
  return label
}

/** Makes a draft, hands it to `run`, and takes it out whatever `run` did. */
async function withDraft(
  page: Page,
  run: (draft: Draft) => Promise<void>,
  from: "version" | "empty" = "version",
): Promise<void> {
  const draft = await makeDraft(page, from)
  try {
    await run(draft)
  } finally {
    await discardDraft(page, draft)
  }
}
