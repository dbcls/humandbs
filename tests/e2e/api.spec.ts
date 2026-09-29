import { expect, test } from "@playwright/test"

import { QUERY_EXAMPLES } from "../../app/api/endpoints"
import { datasetWithSecondaryId } from "./_instance"

/**
 * The JSON a machine reads.
 *
 * **This is a contract with readers outside the portal**, DDBJ Search among
 * them, so what these check is the shape of the answer rather than the words
 * in it.
 */
test.describe("public API", () => {
  test("S-API-01: OpenAPI が出て、載っている経路が実際に応答する", async ({ request }) => {
    const answer = await request.get("/api/openapi.json")
    expect(answer.status()).toBe(200)
    const spec = await answer.json() as { openapi: string, paths: Record<string, unknown> }
    expect(spec.openapi).toMatch(/^3\./)

    // 書いてあるものが応答しないなら、書いてあることに意味が無い
    const named = Object.keys(spec.paths)
    expect(named).toContain("/api/research")
    expect(named).toContain("/api/dataset")
  })

  test("S-API-02: 一覧は一定の件数で切られ、ページを渡すと違う行が返る", async ({ request }) => {
    const first = await (await request.get("/api/research")).json() as {
      total: number
      page: number
      pageCount: number
      hits: { id: string }[]
    }
    expect(first.total).toBeGreaterThan(0)
    expect(first.pageCount).toBeGreaterThan(1)
    expect(first.hits.length).toBeGreaterThan(0)

    // **画面の表示件数は API には適用されない。** 一つの形だけを返すことが
    // 呼ぶ側の予測を保つので、`size` は無視される
    const asked = await (await request.get("/api/research?size=1")).json() as {
      hits: { id: string }[]
    }
    expect(asked.hits.length).toBe(first.hits.length)

    const second = await (await request.get("/api/research?page=2")).json() as {
      page: number
      hits: { id: string }[]
    }
    expect(second.page).toBe(2)
    expect(second.hits[0]?.id).not.toBe(first.hits[0]?.id)
  })

  test("S-API-03: 一括取得は 1 行 1 件で、一覧の総数と揃う", async ({ request }) => {
    const listed = await (await request.get("/api/research?size=1")).json() as { total: number }

    const bulk = await request.get("/api/research.jsonl")
    expect(bulk.status()).toBe(200)
    expect(bulk.headers()["content-type"]).toContain("ndjson")

    const lines = (await bulk.text()).split("\n").filter((line) => line !== "")
    expect(lines).toHaveLength(listed.total)
    // 行が JSON でなければ、1 行 1 件という仕様は守られていない
    const head = lines[0] ?? ""
    expect(() => JSON.parse(head) as unknown).not.toThrow()
  })

  test("S-API-04: dblink は種類の一覧から、種類ごとの一覧、1 件の対応まで辿れ、対応の先が研究のページになる", async ({ request }) => {
    const { types } = await (await request.get("/api/dblink")).json() as { types: string[] }
    expect(types).toEqual(expect.arrayContaining(["humandbs", "jga-dataset", "jga-study"]))

    // 種類ごとの一覧は 1 行 1 件
    const listing = await request.get("/api/dblink/jga-dataset")
    expect(listing.status()).toBe(200)
    const head = (await listing.text()).split("\n").find((line) => line !== "") ?? ""
    const { identifier } = JSON.parse(head) as { identifier: string }
    expect(identifier).toMatch(/^JGAD\d+$/)

    const entry = await (await request.get(`/api/dblink/jga-dataset/${identifier}`)).json() as {
      identifier: string
      dbXrefs: { identifier: string, type: string, url: string }[]
    }
    expect(entry.identifier).toBe(identifier)
    const research = entry.dbXrefs.find((xref) => xref.type === "humandbs")
    expect(research?.identifier).toMatch(/^hum\d+$/)
    // 渡すのは公開中の研究の対応だけなので、リンクの先は開ける
    const opened = await request.get(new URL(research?.url ?? "").pathname)
    expect(opened.status()).toBe(200)

    // 対応が無い accession は 404 ではなく、空の対応で返す
    const none = await (await request.get("/api/dblink/jga-dataset/JGAD999999")).json() as { dbXrefs: unknown[] }
    expect(none.dbXrefs).toEqual([])
  })

  test("S-API-05: 読めない検索式は 422 を返し、その理由を示す", async ({ request }) => {
    const answer = await request.get("/api/research?q=%28unclosed")
    expect(answer.status()).toBe(422)
    expect(answer.headers()["content-type"]).toContain("problem+json")
  })

  test("S-API-07: API の説明のページに例として書いた検索式は、どれも読める", async ({ request }) => {
    // **文法が書いてあるのは説明のページだけ**なので、そこに書いた式が読めないなら
    // 呼ぶ側には文法を知る手段が残らない
    for (const q of QUERY_EXAMPLES) {
      const answer = await request.get(`/api/research?q=${encodeURIComponent(q)}`)
      expect(answer.status(), q).toBe(200)
    }
  })

  test("S-API-08: fields が挙げた値は、そのまま q に書いて必ず当たる", async ({ request }) => {
    const { fields } = await (await request.get("/api/fields")).json() as {
      fields: { code: string, type: string, values?: { code: string }[] }[]
    }
    // 検索行そのものが持つ 4 つは、catalog に何があろうと必ずある
    expect(fields.map((one) => one.code))
      .toEqual(expect.arrayContaining(["id", "title", "date_published", "date_modified"]))

    const named = fields.filter((one) => one.type === "term" && (one.values?.length ?? 0) > 0)
    expect(named.length).toBeGreaterThan(0)

    // **挙げるのは公開されている行が実際に持っている値**なので、どれを書いても
    // 0 件にはならない。定義されているだけの値を挙げていれば、ここで失敗する
    for (const field of named.slice(0, 5)) {
      const q = `${field.code}:"${field.values?.[0]?.code ?? ""}"`
      const answer = await request.get(`/api/dataset?q=${encodeURIComponent(q)}`)
      expect(answer.status(), q).toBe(200)
      const { total } = await answer.json() as { total: number }
      expect(total, q).toBeGreaterThan(0)
    }
  })

  test("S-API-06: API の説明のページに操作の一覧が表示され、stylesheet が適用される", async ({ page }) => {
    await page.goto("/api/docs")

    // **操作の一覧が表示されるのは OpenAPI の定義を読めたときだけ。** 画面は JSON を自分で
    // 取りに行くので、指している先が違えば外側の要素だけが残る
    const operations = page.locator("#swagger-ui .opblock")
    await expect(operations.first()).toBeVisible()
    expect(await operations.count()).toBeGreaterThan(1)

    // **stylesheet が `text/css` で送られなければブラウザは無視する。** 要素は表示された
    // ままなので見えるかどうかでは分からず、色が付いたかで見る
    const painted = await operations.first().evaluate((el) =>
      getComputedStyle(el).backgroundColor)
    expect(painted).not.toBe("rgba(0, 0, 0, 0)")

    // script を実行しない読み手のための文は、Swagger UI が描いたあとには残らない
    await expect(page.locator("#swagger-ui > h1")).toHaveCount(0)
  })

  test("S-API-12: script を実行しなくても API の説明のページと /llms.txt から OpenAPI の定義とエンドポイントの一覧が読める", async ({ request }) => {
    const docs = await (await request.get("/api/docs")).text()
    expect(docs).toContain(`rel="service-desc"`)
    expect(docs).toContain(`<a href="/api/openapi.json">`)
    expect(docs).toContain("<code>GET /api/research</code>")

    const llms = await request.get("/llms.txt")
    expect(llms.status()).toBe(200)
    const text = await llms.text()
    expect(text).toMatch(/^# /)
    expect(text).toMatch(/\]\(https?:\/\/[^)]+\/api\/openapi\.json\)/)
    expect(text).toContain("`GET /api/dataset`")
    expect((await request.get(/\]\((https?:\/\/[^)]+\/api\/openapi\.json)\)/.exec(text)?.[1] ?? "")).status()).toBe(200)
  })

  test("S-API-09: files は includeFiles=true のときだけキーごと返り、true と false のほかは 422 になる", async ({ request }) => {
    const { hits } = await (await request.get("/api/dataset?q=" + encodeURIComponent("id:NHA*"))).json() as {
      hits: { id: string, research: string }[]
    }
    const dataset = hits[0]
    test.skip(dataset === undefined, "NHA のデータセットが無い")
    if (dataset === undefined) return

    for (const path of [`/api/research/${dataset.research}`, `/api/dataset/${dataset.id}`]) {
      for (const absent of [path, `${path}?includeFiles=false`]) {
        const body = await (await request.get(absent)).json() as Record<string, unknown>
        expect(Object.keys(body), absent).not.toContain("files")
      }
      const present = await (await request.get(`${path}?includeFiles=true`)).json() as { files?: unknown }
      expect(Array.isArray(present.files), path).toBe(true)

      const refused = await request.get(`${path}?includeFiles=yes`)
      expect(refused.status(), path).toBe(422)
      expect(refused.headers()["content-type"], path).toContain("application/problem+json")
    }

    // 検索の 1 件も同じ
    const searched = await (await request.get(`/api/dataset?q=${encodeURIComponent(`id:${dataset.id}`)}&includeFiles=true`)).json() as {
      hits: { files?: unknown }[]
    }
    expect(Array.isArray(searched.hits[0]?.files)).toBe(true)
  })

  test("S-API-10: secondary の ID と大文字小文字だけ違う ID で取ると、リダイレクトせずに primary の ID の本文を返す", async ({ page, request }) => {
    const { hits } = await (await request.get("/api/research")).json() as { hits: { id: string }[] }
    const research = hits[0]?.id ?? ""
    const upper = await request.get(`/api/research/${research.toUpperCase()}`, { maxRedirects: 0 })
    expect(upper.status()).toBe(200)
    expect((await upper.json() as { id: string }).id).toBe(research)

    const dataset = await datasetWithSecondaryId(request, page)
    test.skip(dataset === null, "Secondary ID のあるデータセットが無い")
    if (dataset === null) return
    const answer = await request.get(`/api/dataset/${dataset.secondary}`, { maxRedirects: 0 })
    expect(answer.status()).toBe(200)
    const body = await answer.json() as { id: string, url: string }
    expect(body.id).toBe(dataset.id)
    expect(new URL(body.url).pathname).toBe(`/dataset/${dataset.id}`)

    // バージョンは v と先頭に 0 の付かない番号だけ
    expect((await request.get(`/api/research/${research}/v01`)).status()).toBe(404)
    expect((await request.get(`/api/research/${research}/V1`)).status()).toBe(404)
  })

  test("S-API-11: エラーは problem+json で返り、/api の下の無い URL は JSON の 404、どの応答も CORS を全許可する", async ({ request }) => {
    const missing = await request.get("/api/no-such-endpoint")
    expect(missing.status()).toBe(404)
    expect(missing.headers()["content-type"]).toContain("application/problem+json")
    const problem = await missing.json() as { type: string, status: number }
    expect(problem.type).toMatch(/^https:\/\/humandbs\.dbcls\.jp\/problems\//)
    expect(problem.status).toBe(404)

    // 未公開と存在しない ID は同じ 404 で、detail に指定した ID を含めない
    const unknown = await request.get("/api/research/hum9999999")
    expect(unknown.status()).toBe(404)
    expect(unknown.headers()["content-type"]).toContain("application/problem+json")
    expect((await unknown.json() as { detail: string }).detail).not.toContain("hum9999999")

    for (const path of ["/api/research", "/api/research.jsonl", "/api/no-such-endpoint", "/api/research?q=%28unclosed", "/api/openapi.json"]) {
      const answer = await request.get(path, { headers: { Origin: "https://elsewhere.example" } })
      expect(answer.headers()["access-control-allow-origin"], path).toBe("*")
    }
  })
})
