import { expect, test, type APIRequestContext } from "@playwright/test"

import {
  datasetWithSecondaryId,
  firstDataset,
  researchWithJgads,
  researchWithPastVersion,
  unrestrictedResearch,
} from "./_instance"

/**
 * What an anonymous reader can reach.
 *
 * **The scenarios take the labels from the instance rather than naming them.**
 * These run against whatever is deployed — the compose in this repo, or
 * staging — and a research id written here would tie them to one set of rows.
 */
test.describe("P-ANON", () => {
  test("S-PUB-01: 一覧から研究・バージョンの一覧・データセットまで辿れる", async ({ page }) => {
    await page.goto("/research")
    await expect(page.getByRole("heading", { level: 1, name: "研究一覧" })).toBeVisible()

    const row = page.getByRole("link", { name: /^hum\d+$/ }).first()
    const humLabel = (await row.innerText()).trim()
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/research/${humLabel}$`))
    await expect(page.getByRole("heading", { level: 1 })).toContainText(humLabel)

    // バージョンの一覧はこの画面から行ける
    await page.locator(`a[href="/research/${humLabel}/versions"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`/research/${humLabel}/versions$`))
    const version = page.locator(`a[href^="/research/${humLabel}/v"]`).first()
    await expect(version).toBeVisible()

    // 研究に属するデータセット
    await page.goto(`/research/${humLabel}`)
    const dataset = page.getByRole("link", { name: /^(JGAD|hum)\S+$/ })
      .filter({ hasNotText: humLabel }).first()
    if (await dataset.count() === 0) test.skip(true, "この研究には公開中のデータセットが無い")
    const datasetLabel = (await dataset.innerText()).trim()
    await dataset.click()
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetLabel}$`))
    await expect(page.getByRole("heading", { level: 1 })).toContainText(datasetLabel)
  })

  test("S-PUB-02: バージョンを書かない研究の URL は、最新の公開バージョンを表示する", async ({ page, request }) => {
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
    // 応答が示すアドレスはバージョンを書いたほう。バージョンの無いアドレスは人が開くためのもので、
    // プログラムに渡すときのアドレスではない
    expect(new URL(bare.url).pathname).toBe(`/research/${humLabel}/v${newest}`)

    // 画面も同じバージョンを出す — 見出しが示すのは解決した先のバージョン
    await page.goto(`/research/${humLabel}`)
    await expect(page.getByRole("heading", { level: 1 }))
      .toContainText(`${humLabel}-v${newest}`)
  })

  test.describe("JS を実行しないクライアント", () => {
    test.use({ javaScriptEnabled: false })

    test("S-PUB-03: バージョンを書かない研究の URL と一覧は、script なしでも読める", async ({ page }) => {
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

  /**
   * **バージョンのある記事は、代表 URL が公開ページのリンクの先になる。** 読者から見てバージョンの
   * ある記事と無い記事は区別が付かないので、トップからリンクされた記事をすべて開く。
   */
  test("S-PUB-05: トップからリンクされた記事の URL は、どれもリダイレクトせずに 200 を返す", async ({ page, request }) => {
    await page.goto("/")
    const hrefs = await page.locator("a[href^=\"/\"]").evaluateAll((all) =>
      all.map((one) => one.getAttribute("href") ?? ""))
    // 画面の URL (一覧・カート・API など) を除いた、残りが記事
    const screens = /^\/(|en|research|dataset|cart|news|api|auth|swagger-ui)(\/|\?|$)|\.[a-z]+$/
    const documents = [...new Set(hrefs)].filter((href) => !screens.test(href))
    expect(documents.length).toBeGreaterThan(0)
    for (const path of documents) {
      const answer = await request.get(path, { maxRedirects: 0 })
      expect(answer.status(), path).toBe(200)
    }
  })

  test("S-PUB-06: バージョンは v と先頭に 0 の付かない番号だけで開け、過去のバージョンのページはデータセットの内容が現在のものだと表示する", async ({ page, request }) => {
    const research = await researchWithPastVersion(request)
    test.skip(research === null, "公開中のバージョンが 2 つ以上ある研究が無い")
    if (research === null) return
    const numbers = research.versions.map((one) => one.version)
    const past = Math.min(...numbers)
    const latest = Math.max(...numbers)

    // 1 つのページの URL は 1 つ
    expect((await request.get(`/research/${research.id}/v0${past}`)).status()).toBe(404)
    expect((await request.get(`/research/${research.id}/V${past}`)).status()).toBe(404)

    const notice = page.getByText("データセットの一覧はこのバージョンのものですが、各データセットの内容は現在のものを表示しています。")
    await page.goto(`/research/${research.id}/v${past}`)
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`${research.id}-v${past}`)
    await expect(notice).toBeVisible()

    await page.goto(`/research/${research.id}/v${latest}`)
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`${research.id}-v${latest}`)
    await expect(notice).toHaveCount(0)
  })

  test("S-PUB-07: 旧ポータルの URL は、サーバーが研究のページへリダイレクトする", async ({ request }) => {
    const { hits } = await (await request.get("/api/research")).json() as { hits: { id: string, versions: { version: number }[] }[] }
    const research = hits[0]
    expect(research?.id).toMatch(/^hum\d+$/)
    const id = research?.id ?? ""
    const version = research?.versions[0]?.version ?? 1

    for (const [legacy, target] of [
      [`/${id}`, `/research/${id}`],
      [`/${id}-latest`, `/research/${id}`],
      [`/${id}-v${version}`, `/research/${id}/v${version}`],
      [`/${id}-v${version}-release`, `/research/${id}/versions`],
      [`/${id}-latest-release`, `/research/${id}/versions`],
    ] as [string, string][]) {
      expect(await redirectedTo(request, legacy), legacy).toBe(target)
    }
  })

  test("S-PUB-08: secondary の ID と大文字小文字だけ違う ID は primary の ID の URL へリダイレクトし、データセットのページに Secondary ID がある", async ({ page, request }) => {
    const { hits } = await (await request.get("/api/research")).json() as { hits: { id: string }[] }
    const research = hits[0]?.id ?? ""
    expect(await redirectedTo(request, `/research/${research.toUpperCase()}`)).toBe(`/research/${research}`)

    const dataset = await datasetWithSecondaryId(request, page)
    test.skip(dataset === null, "Secondary ID のあるデータセットが無い")
    if (dataset === null) return
    expect(await redirectedTo(request, `/dataset/${dataset.secondary}`)).toBe(`/dataset/${dataset.id}`)
    expect(await redirectedTo(request, `/dataset/${dataset.id.toLowerCase()}`)).toBe(`/dataset/${dataset.id}`)

    // 研究のページのデータセットの表には表示しない
    await page.goto(`/research/${dataset.research}`)
    await expect(page.getByRole("link", { name: dataset.id }).first()).toBeVisible()
    await expect(page.getByText("Secondary ID", { exact: true })).toHaveCount(0)
    await expect(page.getByText(dataset.secondary, { exact: true })).toHaveCount(0)
  })

  test("S-PUB-09: データセットのページの DDBJ Search は JGAD にだけあり、総データ量とファイル形式は API と同じ時に表示される", async ({ page, request }) => {
    const nha = await firstDataset(request, "NHA")
    const jgad = await firstDataset(request, "JGAD")
    test.skip(nha === null || jgad === null, "NHA と JGAD のデータセットの両方が無い")
    if (nha === null || jgad === null) return

    const item = page.locator("dt", { hasText: /^DDBJ Search$/ })
    await page.goto(`/dataset/${jgad.id}`)
    const toArchive = item.locator("xpath=following-sibling::dd[1]//a")
    await expect(toArchive).toHaveAttribute("href", new RegExp(`/${jgad.id}/?$`))
    await expect(toArchive).toHaveAttribute("target", "_blank")

    await page.goto(`/dataset/${nha.id}`)
    await expect(page.getByRole("heading", { level: 1 })).toContainText(nha.id)
    await expect(item).toHaveCount(0)

    // 0 と表示せず、値が無ければ項目ごと表示しない。API も値が無ければキーを返さない
    for (const dataset of [jgad, nha]) {
      const answer = await (await request.get(`/api/dataset/${dataset.id}?includeFiles=true`)).json() as {
        dataVolume?: number
        fileFormats?: unknown[]
      }
      await page.goto(`/dataset/${dataset.id}`)
      const volume = page.locator("dt", { hasText: /^総データ量$/ })
      const formats = page.locator("dt", { hasText: /^ファイル形式$/ })
      await expect(volume, dataset.id).toHaveCount(answer.dataVolume === undefined ? 0 : 1)
      await expect(formats, dataset.id).toHaveCount((answer.fileFormats?.length ?? 0) === 0 ? 0 : 1)
    }
  })

  test("S-PUB-09: 制限公開データの利用者の節は、制限公開のデータセットのある研究では 0 件でも表示し、非制限公開だけの研究では表示しない", async ({ page, request }) => {
    const heading = page.getByRole("heading", { name: "制限公開データの利用者一覧" })

    const controlled = await researchWithJgads(request, 1)
    test.skip(controlled === null, "JGAD のデータセットがある研究が無い")
    if (controlled === null) return
    await page.goto(`/research/${controlled.id}`)
    await expect(heading).toBeVisible()

    const open = await unrestrictedResearch(request)
    test.skip(open === null, "データセットがすべて非制限公開の研究が無い")
    if (open === null) return
    await page.goto(`/research/${open}`)
    await expect(page.getByRole("heading", { level: 1 })).toContainText(open)
    await expect(heading).toHaveCount(0)
  })
})

/** Where the server sends a request for `path`, as a path; fails unless it redirects. */
async function redirectedTo(request: APIRequestContext, path: string): Promise<string> {
  const answer = await request.get(path, { maxRedirects: 0 })
  expect(answer.status(), path).toBe(302)
  const to = new URL(answer.headers().location ?? "", "http://invalid.example")
  return `${to.pathname}${to.search}`
}
