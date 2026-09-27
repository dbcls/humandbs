import { test as base, expect, type Browser, type Locator, type Page, type WorkerInfo } from "@playwright/test"

import { openScreen } from "./_screen"

/**
 * What the signed-in scenarios write, and how it is taken out again.
 *
 * **Everything written here is something a reader cannot see**, and everything
 * is named so that it can be told apart from what the people using the
 * instance made: its name starts with `E2E`. The scenarios take out what they
 * made when they finish; a run that failed half-way leaves it behind, which is
 * what `leftovers.setup.ts` takes out before the next run begins.
 */
export const E2E = "e2e"

/** A name nobody but these scenarios would give something. */
export function e2eName(): string {
  return `${E2E} ${new Date().toISOString()}`
}

/** A draft the scenarios made, and the research it is in. */
export interface Draft {
  /** The research's screen, `/admin/research/{uuid}`. */
  research: string
  /** The draft's editing screen. */
  path: string
  name: string
}

/**
 * The research the scenarios make their drafts in: the first one with a
 * published version, in the order of the IDs.
 *
 * **One research, found the same way every run**, so that the leftovers of a
 * failed run are where the next run looks for them. The listing's own order
 * is by the day of the last change, which making a draft may move.
 */
export async function e2eResearch(page: Page): Promise<string> {
  await page.goto("/admin/research?sort=id&order=asc")
  const rows = page.getByRole("table").first().getByRole("row")
  const published = rows.filter({ hasText: "公開中" }).first()
  await expect(published).toBeVisible()
  const link = published.locator("a[href^=\"/admin/research/\"]").first()
  const path = await link.getAttribute("href") ?? ""
  expect(path).toMatch(/^\/admin\/research\/[0-9a-f-]{36}$/)
  return path
}

/**
 * A draft of the e2e research, named for these scenarios.
 *
 * **Copied from a published version by default**: it then holds what the
 * screens have to show — repeated elements, datasets, a title — which an empty
 * draft does not.
 */
export async function makeDraft(page: Page, from: "version" | "empty" = "version"): Promise<Draft> {
  const research = await e2eResearch(page)
  await page.goto(research)
  const make = from === "version"
    ? page.getByRole("button", { name: "下書きの作成", exact: true }).first()
    : page.getByRole("button", { name: "空の下書きの作成", exact: true })
  await make.click()
  await expect(page).toHaveURL(new RegExp(`${research}/draft/[0-9a-f-]{36}$`))
  const path = new URL(page.url()).pathname

  const name = e2eName()
  const body = page.getByLabel("下書き名", { exact: true })
  await body.fill(name)
  // The route answers a fetcher at `…/name.data`.
  const saved = page.waitForResponse((answer) =>
    answer.request().method() === "POST" && new URL(answer.url()).pathname.startsWith(`${path}/name`))
  await body.locator("xpath=ancestor::form[1]").getByRole("button", { name: "保存", exact: true }).click()
  expect((await saved).ok()).toBe(true)
  return { research, path, name }
}

/** Takes a draft out, from the row the research's screen shows it in. */
export async function discardDraft(page: Page, draft: Pick<Draft, "research" | "name">): Promise<void> {
  await page.goto(draft.research)
  const row = page.getByRole("row").filter({ hasText: draft.name })
  await row.getByRole("button", { name: "削除", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click()
  await expect(page.getByRole("row").filter({ hasText: draft.name })).toHaveCount(0)
}

/** Every draft of the e2e research a previous run left behind. */
export async function discardLeftoverDrafts(page: Page): Promise<void> {
  const research = await e2eResearch(page)
  await page.goto(research)
  const left = page.getByRole("row").filter({ hasText: new RegExp(`^\\s*${E2E} `) })
  for (const text of await left.allInnerTexts()) {
    const name = text.trim().split(/\t|\n/)[0]?.trim() ?? ""
    if (name.startsWith(`${E2E} `)) await discardDraft(page, { research, name })
  }
}

/** The rows of the admin top page's table of open invitations. */
export function invitationRows(page: Page) {
  return page.getByRole("heading", { name: "招待リンク", exact: true }).locator("xpath=following::table[1]").getByRole("row")
}

/** Every invitation these scenarios made that is still open, from the admin top page. */
export async function discardLeftoverInvitations(page: Page): Promise<void> {
  await page.goto("/admin")
  const mine = invitationRows(page).filter({ hasText: "e2e curator" })
  for (let left = await mine.count(); left > 0; left--) {
    await mine.first().getByRole("button", { name: "削除", exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click()
    await expect(mine).toHaveCount(left - 1)
  }
}

/** The e2e research's file list. */
export async function e2eFiles(page: Page): Promise<string> {
  return `${await e2eResearch(page)}/files`
}

/** A file name these scenarios give a file they upload. */
export function e2eFileName(suffix: string): string {
  return `${E2E}-${Date.now()}-${suffix}`
}

/**
 * Uploads files from disk to the e2e research's prefix, and waits for the list
 * to show them. They land private, as every upload does.
 */
export async function uploadFiles(page: Page, paths: string[]): Promise<void> {
  const files = await e2eFiles(page)
  await openScreen(page, files)
  await page.locator("input[type=file]").setInputFiles(paths)
  for (const path of paths) {
    const name = path.split("/").pop() ?? ""
    await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible({ timeout: 120_000 })
  }
}

/** Deletes one file from the e2e research's list, confirming the dialog. */
export async function deleteFile(page: Page, name: string): Promise<void> {
  const row = page.getByRole("row").filter({ hasText: name })
  await row.getByRole("button", { name: "削除", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click()
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0)
}

/** Every file of the e2e research a previous run left behind. */
export async function deleteLeftoverFiles(page: Page): Promise<void> {
  await openScreen(page, `${await e2eFiles(page)}?size=100`)
  const left = page.getByRole("row").filter({ hasText: new RegExp(`(^|\\s)${E2E}-\\d+-`) })
  for (const text of await left.allInnerTexts()) {
    const [name = ""] = new RegExp(`${E2E}-\\d+-\\S+`).exec(text) ?? []
    if (name !== "") await deleteFile(page, name)
  }
}

/** The Japanese body of every alert on the alert screen. */
export function alertBodies(page: Page): Locator {
  return page.getByRole("textbox", { name: /^日本語/ })
}

/** The alert a body belongs to: the block with its own delete button. */
export function alertOf(body: Locator): Locator {
  return body.locator("xpath=ancestor::*[.//button[normalize-space()='削除']][1]")
}

/**
 * Every article, news item and alert a previous run left behind: an article
 * by its slug, a news item by its title, an alert by its Japanese body.
 */
export async function deleteLeftoverSiteContent(page: Page): Promise<void> {
  for (const [listing, prefix, remove] of [
    ["/admin/news", `${E2E} `, "お知らせの削除"],
    ["/admin/documents", `${E2E}-`, "記事の削除"],
  ] as const) {
    await openScreen(page, listing)
    const left = await page.getByRole("main").locator(`a[href^="${listing}/"]`).evaluateAll(
      (all, start) => all.filter((one) => one.textContent.trim().startsWith(start)).map((one) => one.getAttribute("href") ?? ""),
      prefix,
    )
    for (const href of new Set(left)) {
      await openScreen(page, href)
      await page.getByRole("button", { name: remove }).click()
      await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`${listing}$`))
    }
  }

  await openScreen(page, "/admin/alert")
  for (;;) {
    const values = await alertBodies(page).evaluateAll((all) => all.map((one) => (one as HTMLTextAreaElement).value))
    const at = values.findIndex((value) => value.startsWith(E2E))
    if (at < 0) break
    await alertOf(alertBodies(page).nth(at)).getByRole("button", { name: "削除", exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click()
    await expect(alertBodies(page)).toHaveCount(values.length - 1)
  }
}

/**
 * A context signed in as the project's session, for what outlives one test.
 *
 * `browser.newContext` does not read the project's options by itself.
 */
async function signedInPage(browser: Browser, info: WorkerInfo): Promise<Page> {
  const { baseURL, storageState, locale, viewport } = info.project.use
  const context = await browser.newContext({ baseURL, storageState, locale, viewport })
  return await context.newPage()
}

/**
 * The scenarios that only read a draft share one, made once per worker and
 * taken out when the worker ends — which Playwright also does after a test
 * fails, so a failure does not leave it behind.
 */
export const test = base.extend<object, { sharedDraft: Draft }>({
  sharedDraft: [async ({ browser }, use, info) => {
    const page = await signedInPage(browser, info)
    const draft = await makeDraft(page)
    await use(draft)
    await discardDraft(page, draft)
    await page.context().close()
  }, { scope: "worker" }],
})
