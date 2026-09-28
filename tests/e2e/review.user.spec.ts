import { writeFile } from "node:fs/promises"

import { expect, type Browser, type Page } from "@playwright/test"

import { SIGNED_IN } from "../../playwright.config"
import { deleteFile, discardDraft, E2E, e2eFileName, e2eFiles, makeDraft, test, uploadFiles, type Draft } from "./_admin"
import { openScreen } from "./_screen"

/**
 * A draft shown to its provider through a share link, and what the provider
 * sends back.
 *
 * **The provider is a browser with no session at all**, as a provider's is:
 * the draft is made and shared with the curator's session, and the preview is
 * opened in a context of its own with an empty cookie jar. Each scenario takes
 * its draft out at the end, and the comments and the share link go with it.
 *
 * **What the provider sends is sent to Slack** on an instance with a webhook,
 * as a real provider's is.
 */
test.describe("P-REVIEW 共有リンク", () => {
  test.skip(SIGNED_IN === "", "HUMANDBS_E2E_SESSION が無い (npm run e2e:session)")

  const PROVIDER = `${E2E} 提供者`

  test("S-REVIEW-01: 共有リンクのプレビューは noindex と no-referrer の header で返り、アラートを表示しない", async ({ page, browser }) => {
    await withSharedDraft(page, async (_draft, preview) => {
      const provider = await anonymous(browser)
      const answer = await provider.goto(preview)
      expect(answer?.status()).toBe(200)
      expect(answer?.headers()["x-robots-tag"]).toBe("noindex, nofollow")
      expect(answer?.headers()["referrer-policy"]).toBe("no-referrer")
      await expect(provider.getByRole("heading", { level: 1 })).not.toBeEmpty()
      await expect(provider.getByRole("region", { name: "アラート" })).toHaveCount(0)

      // 表示中のアラートがある配置では、公開ページには表示され、プレビューには表示されない
      await provider.goto("/")
      const shown = await provider.getByRole("region", { name: "アラート" }).count()
      await provider.goto(preview)
      await expect(provider.getByRole("region", { name: "アラート" })).toHaveCount(0)
      test.info().annotations.push({ type: "alert", description: shown === 0 ? "表示中のアラートが無い" : "表示中のアラートがある" })
      await provider.context().close()
    })
  })

  test("S-REVIEW-02: 欄と下書き全体にコメントを書け、名前は必須で、ログインしていなければ (anonymous) が付く", async ({ page, browser }) => {
    await withSharedDraft(page, async (draft, preview) => {
      const provider = await anonymous(browser)
      await openScreen(provider, preview)

      // 欄へのコメント: 名前が無いと投稿できない
      await provider.getByRole("button", { name: "研究題目 へのコメント" }).click()
      const panel = commentPanel(provider, "研究題目 へのコメント")
      await panel.getByRole("textbox", { name: "コメント" }).fill(`${E2E} 研究題目への指摘`)
      await panel.getByRole("button", { name: "投稿する" }).click()
      await expect(panel.getByText("名前を入れてください。")).toBeVisible()
      await panel.getByRole("textbox", { name: "お名前" }).fill(PROVIDER)
      await panel.getByRole("button", { name: "投稿する" }).click()
      await expect(panel.getByText(`${E2E} 研究題目への指摘`)).toBeVisible()
      await expect(panel.getByText(new RegExp(`^${PROVIDER}\\s*\\(anonymous\\)$`))).toBeVisible()
      await panel.getByRole("button", { name: "閉じる" }).click()

      // 全体へのコメント
      await provider.getByRole("button", { name: "全体へのコメント" }).click()
      const whole = commentPanel(provider, "全体へのコメント")
      await whole.getByRole("textbox", { name: "コメント" }).fill(`${E2E} 全体への指摘`)
      await whole.getByRole("button", { name: "投稿する" }).click()
      await expect(whole.getByText(`${E2E} 全体への指摘`)).toBeVisible()
      await provider.context().close()

      // ログインしている人はアカウントの名前で書き、(anonymous) は付かない
      await openScreen(page, preview)
      await page.getByRole("button", { name: "研究題目 へのコメント" }).click()
      const own = commentPanel(page, "研究題目 へのコメント")
      await expect(own.getByRole("textbox", { name: "お名前" })).toHaveCount(0)
      await own.getByRole("textbox", { name: "コメント" }).fill(`${E2E} 事務局のコメント`)
      await own.getByRole("button", { name: "投稿する" }).click()
      await expect(own.getByText(`${E2E} 事務局のコメント`)).toBeVisible()
      // 名前だけで、(anonymous) が続かない
      await expect(own.getByText("e2e curator", { exact: true })).toBeVisible()

      // admin の画面の未解決のコメントに、3 つとも並ぶ
      await openScreen(page, `${draft.path}/review`)
      const open = page.getByRole("heading", { name: "未解決のコメント" }).locator("xpath=ancestor::section[1]")
      for (const body of ["研究題目への指摘", "全体への指摘", "事務局のコメント"]) {
        await expect(open.getByText(`${E2E} ${body}`), body).toBeVisible()
      }
    })
  })

  test("S-REVIEW-03: 提供者のボタンは押した人ごとに 1 行で、押した回数が admin の画面に表示される", async ({ page, browser }) => {
    await withSharedDraft(page, async (draft, preview) => {
      const provider = await anonymous(browser)
      await openScreen(provider, preview)
      const commented = provider.getByRole("button", { name: "コメントを書き終えました。事務局に確認をお願いします" })
      const approved = provider.getByRole("button", { name: "修正の必要はありません。この内容で問題ありません" })

      await provider.getByRole("textbox", { name: "お名前" }).first().fill(PROVIDER)
      for (const press of [commented, commented, approved]) {
        await press.click()
        await expect(provider.getByText(/事務局にお送りしました。$/).last()).toBeVisible()
      }
      await provider.context().close()

      await openScreen(page, `${draft.path}/review`)
      const pressed = (button: string) => page.getByRole("heading", { name: `「${button}」を押した人` })
        .locator("xpath=following::table[1]")
        .getByRole("row")
        .filter({ hasText: PROVIDER })
      await expect(pressed("コメントを書き終えました")).toHaveCount(1)
      await expect(pressed("コメントを書き終えました")).toContainText("2 回")
      await expect(pressed("修正の必要はありません")).toHaveCount(1)
      await expect(pressed("修正の必要はありません")).toContainText("1 回")
    })
  })

  test("S-REVIEW-04: 停止中と再発行前のトークンは、存在しないリンクと同じ 404 になり、再開すると同じ URL が開く", async ({ page, playwright }) => {
    // 提供者と同じく、セッションの無い request で開く
    const request = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    await withSharedDraft(page, async (draft, preview) => {
      // 本文には開いた URL が入るので、トークンを置き換えてから比べる
      const bodyOf = async (path: string) => {
        const answer = await request.get(path)
        const token = path.split("/").pop() ?? ""
        return { status: answer.status(), body: (await answer.text()).replaceAll(token, "TOKEN") }
      }
      const unknown = await bodyOf(`/preview/${"x".repeat(43)}`)
      expect(unknown.status).toBe(404)
      const opened = async (path: string) => {
        const answer = await bodyOf(path)
        return { status: answer.status, same: answer.body === unknown.body }
      }
      expect((await opened(preview)).status).toBe(200)

      await openScreen(page, `${draft.path}/review`)
      await page.getByRole("button", { name: "共有停止", exact: true }).click()
      await expect(page.getByText("未共有", { exact: true })).toBeVisible()
      expect(await opened(preview)).toEqual({ status: 404, same: true })

      // 再開すると同じ URL
      await page.getByRole("button", { name: "共有", exact: true }).click()
      await expect(page.getByText("共有中", { exact: true })).toBeVisible()
      expect(await sharedPath(page)).toBe(preview)
      expect((await opened(preview)).status).toBe(200)

      // 再発行すると URL が変わり、前の URL は開かない
      await page.getByRole("button", { name: "共有リンクの再発行" }).click()
      await page.getByRole("dialog").getByRole("button", { name: "再発行", exact: true }).click()
      await expect.poll(async () => await sharedPath(page)).not.toBe(preview)
      const reissued = await sharedPath(page)
      expect(await opened(preview)).toEqual({ status: 404, same: true })
      expect((await opened(reissued)).status).toBe(200)
    })
    await request.dispose()
  })

  test("S-REVIEW-05: 未確定の欄は「ご教示ください」、公開後に入る値は「公開後に自動で入ります」と表示する", async ({ page, browser }) => {
    await withSharedDraft(page, async (draft, preview) => {
      // 研究題目を未確定にして保存する
      await openScreen(page, draft.path)
      await page.getByRole("group", { name: "値の扱い" }).first().getByRole("button", { name: "未確定" }).click()
      await saveDraft(page)

      // ID を発行していないデータセットは、公開日などが公開してから入る
      await openScreen(page, `${draft.path}/dataset`)
      await page.getByRole("button", { name: "データセットの作成" }).click()
      await expect(page).toHaveURL(new RegExp(`${draft.path}/dataset/[0-9a-f-]{36}$`))
      const dataset = new URL(page.url()).pathname.split("/").pop() ?? ""

      // 空の下書きで未確定にしたのは研究題目だけ
      const provider = await anonymous(browser)
      await openScreen(provider, preview)
      await expect(provider.getByText("ご教示ください", { exact: true })).toHaveCount(1)

      await openScreen(provider, `${preview}/dataset/${dataset}`)
      const published = provider.locator("dt", { hasText: /^公開日$/ }).locator("xpath=following-sibling::dd[1]")
      await expect(published).toHaveText("公開後に自動で入ります")
      await provider.context().close()
    }, "empty")
  })

  test("S-REVIEW-05: プレビューの非公開のファイルにはダウンロードのリンクが無く、URL の一覧とコピーも無い", async ({ page, browser }) => {
    const name = e2eFileName("preview.txt")
    await writeFile(test.info().outputPath(name), `${E2E}\n`)
    await uploadFiles(page, [test.info().outputPath(name)])
    // 研究の公開ページの節には、表示に設定したファイルだけが並ぶ
    const listed = page.getByRole("checkbox", { name: `研究ページに表示: ${name}` })
    await listed.check()
    await expect(listed).toBeChecked()
    try {
      await withSharedDraft(page, async (_draft, preview) => {
        const provider = await anonymous(browser)
        await openScreen(provider, preview)
        const section = provider.getByRole("heading", { name: "非制限公開ファイル" }).locator("xpath=ancestor::section[1]")
        const row = section.getByRole("row").filter({ hasText: name })
        await expect(row).toContainText("未公開")
        await expect(row.getByRole("link")).toHaveCount(0)
        await expect(section.getByRole("link", { name: "URL の一覧のダウンロード" })).toHaveCount(0)
        await expect(section.getByRole("button", { name: "URL のコピー" })).toHaveCount(0)
        await provider.context().close()
      })
    } finally {
      await openScreen(page, await e2eFiles(page))
      await deleteFile(page, name)
    }
  })

  test("S-DRAFT-04: コメントは admin が解決・解決の取り消し・削除でき、解決したものは未解決のコメントから外れる", async ({ page, browser }) => {
    await withSharedDraft(page, async (draft, preview) => {
      const provider = await anonymous(browser)
      await openScreen(provider, preview)
      await provider.getByRole("button", { name: "研究題目 へのコメント" }).click()
      const panel = commentPanel(provider, "研究題目 へのコメント")
      await panel.getByRole("textbox", { name: "お名前" }).fill(PROVIDER)
      await panel.getByRole("textbox", { name: "コメント" }).fill(`${E2E} 解決するコメント`)
      await panel.getByRole("button", { name: "投稿する" }).click()
      await expect(panel.getByText(`${E2E} 解決するコメント`)).toBeVisible()
      // 提供者には、解決と削除のボタンが無い
      await expect(panel.getByRole("button", { name: "解決", exact: true })).toHaveCount(0)
      await expect(panel.getByRole("button", { name: "削除", exact: true })).toHaveCount(0)
      await provider.context().close()

      // 未解決のコメントから解決すると、一覧から外れる
      await openScreen(page, `${draft.path}/review`)
      const open = page.getByRole("heading", { name: "未解決のコメント" }).locator("xpath=ancestor::section[1]")
      const item = open.getByRole("listitem").filter({ hasText: `${E2E} 解決するコメント` })
      await item.getByRole("button", { name: "解決", exact: true }).click()
      await expect(item).toHaveCount(0)
      await expect(open.getByText("未解決のコメントはありません。")).toBeVisible()

      // 欄のコメントでは解決済みとして残り、取り消すと未解決に戻る
      await openScreen(page, draft.path)
      await page.getByRole("button", { name: /^研究題目 へのコメント/ }).first().click()
      const fieldPanel = commentPanel(page, "研究題目 へのコメント")
      const comment = fieldPanel.getByRole("listitem").filter({ hasText: `${E2E} 解決するコメント` })
      await expect(comment.getByText("解決済み", { exact: true })).toBeVisible()
      await comment.getByRole("button", { name: "解決の取り消し" }).click()
      await expect(comment.getByText("未解決", { exact: true })).toBeVisible()

      // 削除すると、どこにも残らない
      await comment.getByRole("button", { name: "削除", exact: true }).click()
      await expect(comment).toHaveCount(0)
      await openScreen(page, `${draft.path}/review`)
      await expect(page.getByText(`${E2E} 解決するコメント`)).toHaveCount(0)
    })
  })
})

/**
 * Makes a draft, shares it, hands its preview's path to `run`, and takes the
 * draft out whatever `run` did.
 */
async function withSharedDraft(
  page: Page,
  run: (draft: Draft, preview: string) => Promise<void>,
  from: "version" | "empty" = "version",
): Promise<void> {
  const draft = await makeDraft(page, from)
  try {
    await openScreen(page, `${draft.path}/review`)
    await page.getByRole("button", { name: "共有", exact: true }).click()
    await expect(page.getByText("共有中", { exact: true })).toBeVisible()
    await run(draft, await sharedPath(page))
  } finally {
    await discardDraft(page, draft)
  }
}

/**
 * Saves the draft's form with the toolbar's button, which follows the draft
 * name's, and waits for the response to the save.
 */
async function saveDraft(page: Page): Promise<void> {
  const saved = page.waitForResponse((answer) => answer.request().method() === "POST"
    && /\/draft\/[0-9a-f-]{36}(\.data)?$/.test(new URL(answer.url()).pathname))
  await page.getByRole("button", { name: "保存", exact: true }).last().click()
  expect((await saved).ok()).toBe(true)
}

/** The comment panel a button opened, found by its name. */
function commentPanel(page: Page, name: string) {
  return page.getByRole("dialog", { name })
}

/** The share link's path as the review screen shows it, shared or not. */
async function sharedPath(page: Page): Promise<string> {
  const shown = await page.getByRole("main").innerText()
  const [address = ""] = /https?:\/\/\S+?\/preview\/[\w-]+/.exec(shown) ?? []
  return new URL(address).pathname
}

/**
 * A browser with no session, as a provider's is.
 *
 * **`browser.newContext` takes the project's options by default**, the
 * curator's session among them, so the cookie jar is emptied by name.
 */
async function anonymous(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: { cookies: [], origins: [] },
  })
  return await context.newPage()
}
