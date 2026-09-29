import { expect, type Locator, type Page } from "@playwright/test"

import { SIGNED_IN } from "../../playwright.config"
import { alertBodies, alertOf, E2E, e2eName, test } from "./_admin"
import { openScreen } from "./_screen"

/**
 * The site's own writing, written and taken out again without being shown.
 *
 * **Nothing here is published or shown**: an article, a news item and an
 * alert are made, saved in one language and deleted, and a reader never sees
 * them. What is checked on the way is that a body with HTML in it is refused
 * whole, with the line it is on.
 */
test.describe("P-SITE サイトコンテンツ", () => {
  test.skip(SIGNED_IN === "", "HUMANDBS_E2E_SESSION が無い (npm run e2e:session)")

  test("S-SITE-01: お知らせは公開せずに保存でき、HTML を含む本文は行番号付きで拒否され、削除できる", async ({ page }) => {
    await openScreen(page, "/admin/news")
    await page.getByRole("button", { name: "お知らせの作成" }).click()
    await expect(page).toHaveURL(/\/admin\/news\/[0-9a-f-]{36}$/)
    await page.waitForLoadState("networkidle")
    // 先に e2e の題名で保存し、途中で失敗しても次の実行が見つけて消せるようにする
    const title = e2eName()
    const [body, save] = bodyAndSave(page)
    await page.getByRole("textbox", { name: /^タイトル/ }).first().fill(title)
    await save.click()
    await expect(save).toBeDisabled()
    await expectBodyRefused(page, body, save)

    await page.getByRole("button", { name: "お知らせの削除" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/news$/)
    await expect(page.getByRole("link", { name: title })).toHaveCount(0)
  })

  test("S-SITE-01: 記事は公開せずに保存でき、HTML を含む本文は行番号付きで拒否され、削除できる", async ({ page }) => {
    await openScreen(page, "/admin/documents")
    await page.getByRole("button", { name: "記事の作成" }).click()
    const slug = `${E2E}-${Date.now()}`
    await page.getByRole("dialog").getByRole("textbox", { name: "slug" }).fill(slug)
    await page.getByRole("dialog").getByRole("button", { name: "作成" }).click()
    await expect(page).toHaveURL(/\/admin\/documents\/[0-9a-f-]{36}$/)
    await page.waitForLoadState("networkidle")
    await page.getByRole("textbox", { name: /^タイトル/ }).first().fill(e2eName())
    await expectBodyRefused(page, ...bodyAndSave(page))
    // 公開していないので、読者の URL は 404
    expect((await page.request.get(`/${slug}`)).status()).toBe(404)

    await page.getByRole("button", { name: "記事の削除" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/documents$/)
    await expect(page.getByText(slug)).toHaveCount(0)
  })

  test("S-SITE-02: 記事の編集中に pane を公開ページに切り替えて戻しても入力が残り、フォームを表示していないあいだも画面を離れる前に確認する", async ({ page }) => {
    await openScreen(page, "/admin/documents")
    await page.getByRole("button", { name: "記事の作成" }).click()
    const slug = `${E2E}-${Date.now()}`
    await page.getByRole("dialog").getByRole("textbox", { name: "slug" }).fill(slug)
    await page.getByRole("dialog").getByRole("button", { name: "作成" }).click()
    await expect(page).toHaveURL(/\/admin\/documents\/[0-9a-f-]{36}$/)
    await page.waitForLoadState("networkidle")
    const title = e2eName()
    const [body, save] = bodyAndSave(page)
    await page.getByRole("textbox", { name: /^タイトル/ }).first().fill(title)
    await body.fill(`${E2E} の本文\n2 行目`)
    const here = page.url()

    // 左の pane を公開ページにすると、どちらの pane にもフォームが無い
    const left = page.getByRole("tablist").first()
    await left.getByRole("tab", { name: "公開ページ en" }).click()
    await expect(page.locator("[data-pane-body]").locator("form textarea, form input[name=title]")).toHaveCount(0)
    await page.getByRole("navigation").getByRole("link", { name: "記事一覧" }).first().click()
    const leave = page.getByRole("dialog").filter({ hasText: "保存していない変更があります。" })
    await expect(leave).toBeVisible()
    await leave.getByRole("button", { name: "キャンセル" }).click()
    expect(page.url()).toBe(here)

    // 戻すと入力が残っていて、保存していないので保存を押せる
    await left.getByRole("tab", { name: "編集 ja" }).click()
    await expect(page.getByRole("textbox", { name: /^タイトル/ }).first()).toHaveValue(title)
    // 送られるのは editor の下の textarea の値で、editor もそれを表示する
    await expect(page.locator("[data-pane-body] form textarea[name=body]").first()).toHaveValue(`${E2E} の本文\n2 行目`)
    await expect(body).toContainText("2 行目")
    await expect(save).toBeEnabled()
    await save.click()
    await expect(save).toBeDisabled()

    // 保存したあとは、切り替えても画面を離れるときに確認しない
    await left.getByRole("tab", { name: "公開ページ en" }).click()
    await page.getByRole("navigation").getByRole("link", { name: "記事一覧" }).first().click()
    await expect(page).toHaveURL(/\/admin\/documents$/)
    await page.goto(here)
    await page.getByRole("button", { name: "記事の削除" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/documents$/)
  })

  test("S-SITE-03: 記事の ja と en の両方に入力してから ja を保存しても画面の移動を確認せず、en の入力は残る", async ({ page }) => {
    await openScreen(page, "/admin/documents")
    await page.getByRole("button", { name: "記事の作成" }).click()
    const slug = `${E2E}-${Date.now()}`
    await page.getByRole("dialog").getByRole("textbox", { name: "slug" }).fill(slug)
    await page.getByRole("dialog").getByRole("button", { name: "作成" }).click()
    await expect(page).toHaveURL(/\/admin\/documents\/[0-9a-f-]{36}$/)
    await page.waitForLoadState("networkidle")
    // 右の pane を編集 en にして、左 (ja) と右 (en) の両方に入力する
    await page.getByRole("tablist").nth(1).getByRole("tab", { name: "編集 en" }).click()
    const forms = page.locator("[data-pane-body] form")
    const [ja, en] = [forms.nth(0), forms.nth(1)]
    await ja.getByRole("textbox", { name: /^タイトル/ }).fill(e2eName())
    await en.getByRole("textbox", { name: /^タイトル/ }).fill(`${E2E} en`)
    const saveJa = ja.getByRole("button", { name: "保存", exact: true })
    const saveEn = en.getByRole("button", { name: "保存", exact: true })

    await saveJa.click()
    await expect(saveJa).toBeDisabled()
    await expect(page.getByRole("dialog").filter({ hasText: "保存していない変更があります。" })).toHaveCount(0)
    await expect(en.getByRole("textbox", { name: /^タイトル/ })).toHaveValue(`${E2E} en`)
    await expect(saveEn).toBeEnabled()

    await saveEn.click()
    await expect(saveEn).toBeDisabled()
    await page.getByRole("button", { name: "記事の削除" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/documents$/)
  })

  test("S-SITE-01: アラートは表示せずに保存でき、HTML を含む本文は行番号付きで拒否され、削除できる", async ({ page }) => {
    await openScreen(page, "/admin/alert")
    const before = await alertBodies(page).count()
    await page.getByRole("button", { name: "アラートの作成" }).click()
    await expect(alertBodies(page)).toHaveCount(before + 1)
    const values = await alertBodies(page).evaluateAll((all) => all.map((one) => (one as HTMLTextAreaElement).value))
    const body = alertBodies(page).nth(values.indexOf(""))
    const alert = alertOf(body)
    // 先に e2e の本文で保存し、途中で失敗しても次の実行が見つけて消せるようにする
    const save = alert.getByRole("button", { name: "保存", exact: true })
    await body.fill(`${E2E} のアラート`)
    await save.click()
    await expect(save).toBeDisabled()
    await expectBodyRefused(page, body, save)
    await expect(alert.getByText("非表示", { exact: true })).toBeVisible()

    await alert.getByRole("button", { name: "削除", exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click()
    await expect(alertBodies(page)).toHaveCount(before)
  })
})

/** The Japanese body of an article or a news item, and the save of its form. */
function bodyAndSave(page: Page): [Locator, Locator] {
  const body = page.getByRole("textbox", { name: "本文" }).first()
  return [body, body.locator("xpath=ancestor::form[1]").getByRole("button", { name: "保存", exact: true })]
}

/**
 * Writes a body with HTML on its second line, saves, and expects the save to
 * be refused naming that line; then writes it without and saves.
 */
async function expectBodyRefused(page: Page, body: Locator, save: Locator): Promise<void> {
  await body.fill(`${E2E} の本文\n<b>太字</b>`)
  await save.click()
  await expect(page.getByRole("status").filter({ hasText: "本文に直すところがあるため、保存していません。問題のある行を欄の下に表示しています。" })).toHaveCount(1)
  await expect(page.getByText("2 行目: HTML のタグは書けません")).toBeVisible()

  await body.fill(`${E2E} の本文`)
  await save.click()
  await expect(page.getByText("2 行目: HTML のタグは書けません")).toHaveCount(0)
  await expect(save).toBeDisabled()
}
