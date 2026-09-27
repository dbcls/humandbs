import { expect, test, type APIRequestContext, type Page } from "@playwright/test"

import { EXPECTED } from "../../playwright.config"

/**
 * What the deployment shows search engines and whoever watches it.
 *
 * **These check the instance against what it was meant to be**, which the
 * one running them passes in (`EXPECTED`): production and staging hold the same
 * rows and differ only in whether search engines are kept out.
 */
test.describe("P-ANON 配置", () => {
  test("S-SEO-01: robots.txt が sitemap を示し、sitemap と研究・データセットのページが検索エンジン向けの情報を持つ", async ({ page, request }) => {
    test.skip(EXPECTED.noindex !== "false", "HUMANDBS_E2E_NOINDEX=false で回す先ではない")
    const { research, dataset } = await firstOfEach(request)

    const robots = await (await request.get("/robots.txt")).text()
    expect(robots).toMatch(/^Disallow:\s*$/m)
    expect(robots).toMatch(/^Sitemap: https?:\/\/[^/\s]+\/sitemap\.xml$/m)

    const sitemap = await request.get("/sitemap.xml")
    expect(sitemap.status()).toBe(200)
    expect(sitemap.headers()["content-type"]).toContain("xml")
    const listed = await sitemap.text()
    expect(listed).toContain(`/research/${research}<`)
    expect(listed).toContain(`/dataset/${dataset}<`)
    expect(listed).toContain(`/en/research/${research}"`)
    // バージョンのページは並べない
    expect(listed).not.toContain(`/research/${research}/v`)

    for (const [path, en] of [[`/research/${research}`, `/en/research/${research}`], [`/dataset/${dataset}`, `/en/dataset/${dataset}`]] as const) {
      await page.goto(path)
      await expect(page.locator("meta[name=\"robots\"]"), path).toHaveCount(0)
      expect(await page.locator("meta[name=\"description\"]").getAttribute("content"), path).not.toBe("")
      expect(await page.locator("meta[property=\"og:title\"]").getAttribute("content"), path).not.toBe("")
      expect(new URL(await page.locator("link[rel=\"alternate\"][hreflang=\"en\"]").getAttribute("href") ?? "").pathname, path).toBe(en)
      expect(new URL(await page.locator("link[rel=\"alternate\"][hreflang=\"x-default\"]").getAttribute("href") ?? "").pathname, path).toBe(path)
      const described = JSON.parse(await page.locator("script[type=\"application/ld+json\"]").first().textContent() ?? "{}") as {
        "@type"?: string
        "url"?: string
      }
      expect(described["@type"], path).toBe("Dataset")
      expect(new URL(described.url ?? "").pathname, path).toBe(path)
    }
  })

  test("S-SEO-02: すべてのページに noindex があり、robots.txt は API のほかを拒否し、sitemap は 404 になる", async ({ page, request }) => {
    test.skip(EXPECTED.noindex !== "true", "HUMANDBS_E2E_NOINDEX=true で回す先ではない")
    const { research, dataset } = await firstOfEach(request)

    const robots = (await (await request.get("/robots.txt")).text()).split("\n").map((line) => line.trim()).filter((line) => line !== "")
    expect(robots).toEqual(["User-agent: *", "Allow: /api/", "Allow: /swagger-ui/", "Disallow: /"])
    expect((await request.get("/sitemap.xml")).status()).toBe(404)

    for (const path of ["/", "/research", `/research/${research}`, `/dataset/${dataset}`, "/en/research", "/aim"]) {
      await expectNoindex(page, path)
    }
  })

  test("S-OPS-01: /healthz が 200 を返し、依存サービスに接続でき、version が deploy した tag である", async ({ request }) => {
    test.skip(EXPECTED.version === "", "HUMANDBS_E2E_VERSION が無い")
    const answer = await request.get("/healthz")
    expect(answer.status()).toBe(200)
    const health = await answer.json() as { ok: boolean, checks: { name: string, ok: boolean }[], version: string | null }
    expect(health.ok).toBe(true)
    expect(health.checks.map((one) => one.name).sort()).toEqual(["database", "storage"])
    expect(health.checks.every((one) => one.ok)).toBe(true)
    expect(health.version).toBe(EXPECTED.version)
  })
})

async function firstOfEach(request: APIRequestContext): Promise<{ research: string, dataset: string }> {
  const research = (await (await request.get("/api/research")).json() as { hits: { id: string }[] }).hits[0]?.id ?? ""
  const dataset = (await (await request.get("/api/dataset")).json() as { hits: { id: string }[] }).hits[0]?.id ?? ""
  expect(research).not.toBe("")
  expect(dataset).not.toBe("")
  return { research, dataset }
}

async function expectNoindex(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await expect(page.locator("meta[name=\"robots\"]"), path).toHaveAttribute("content", /noindex/)
}
