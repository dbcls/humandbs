import { expect, test } from "@playwright/test"

import { QUERY_EXAMPLES } from "../../app/api/endpoints"

/**
 * The JSON a machine reads (`docs/public-api.md`).
 *
 * **This is a contract with readers outside the portal**, DDBJ Search among
 * them, so what these check is the shape of the answer rather than the words
 * in it.
 */
test.describe("public API", () => {
  test("S-API-01: OpenAPI が出て、載っている道が実際に答える", async ({ request }) => {
    const answer = await request.get("/api/openapi.json")
    expect(answer.status()).toBe(200)
    const spec = await answer.json() as { openapi: string, paths: Record<string, unknown> }
    expect(spec.openapi).toMatch(/^3\./)

    // 書いてあるものが答えないなら、書いてあることに意味が無い
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

    // **画面の表示件数は機械が読む面に効かない。** 一つの形だけを出すことが
    // 呼ぶ側の予測を保つので、`size` は読まれずに落ちる
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
    // 行が JSON でなければ、1 行 1 件という約束は守られていない
    const head = lines[0] ?? ""
    expect(() => JSON.parse(head) as unknown).not.toThrow()
  })

  test("S-API-04: relation の供給が型の一覧から個別まで通る", async ({ request }) => {
    const types = await request.get("/api/dblink")
    expect(types.status()).toBe(200)
    const listed = await types.json() as unknown
    expect(listed).not.toBeNull()
  })

  test("S-API-05: 読めない検索式は 422 を返し、その理由を言う", async ({ request }) => {
    const answer = await request.get("/api/research?q=%28unclosed")
    expect(answer.status()).toBe(422)
    expect(answer.headers()["content-type"]).toContain("problem+json")
  })

  test("S-API-07: document が載せている検索式は、どれも読める", async ({ request }) => {
    // **文法が書いてあるのは document だけ**なので、そこに載せた式が読めないなら
    // 呼ぶ側には文法を知る手段が残らない
    for (const q of QUERY_EXAMPLES) {
      const answer = await request.get(`/api/research?q=${encodeURIComponent(q)}`)
      expect(answer.status(), q).toBe(200)
    }
  })

  test("S-API-08: fields が挙げた値は、そのまま q に書いて必ず当たる", async ({ request }) => {
    const { fields } = await (await request.get("/api/fields")).json() as {
      fields: { code: string, type: string, inAnswers: boolean, values?: { code: string }[] }[]
    }
    // 検索行そのものが持つ 4 つは、catalog に何があろうと必ずある
    expect(fields.map((one) => one.code))
      .toEqual(expect.arrayContaining(["id", "title", "date_published", "date_modified"]))

    const named = fields.filter((one) => one.type === "term" && (one.values?.length ?? 0) > 0)
    expect(named.length).toBeGreaterThan(0)

    // **挙げるのは公開されている行が実際に持っている値**なので、どれを書いても
    // 0 件にはならない。定義されているだけの値を挙げていれば、ここで落ちる
    for (const field of named.slice(0, 5)) {
      const q = `${field.code}:"${field.values?.[0]?.code ?? ""}"`
      const answer = await request.get(`/api/dataset?q=${encodeURIComponent(q)}`)
      expect(answer.status(), q).toBe(200)
      const { total } = await answer.json() as { total: number }
      expect(total, q).toBeGreaterThan(0)
    }

    // **絞れることと読めることは別で、それを言うのが `inAnswers`。** 公開表現が
    // 落とすキーは答えに出ないまま、条件としては効く
    const unshown = named.find((one) => !one.inAnswers)
    if (unshown !== undefined) {
      const q = `${unshown.code}:"${unshown.values?.[0]?.code ?? ""}"`
      const answer = await request.get(`/api/dataset?q=${encodeURIComponent(q)}`)
      const { total, hits } = await answer.json() as {
        total: number
        hits: { values: { key: string }[] }[]
      }
      expect(total, q).toBeGreaterThan(0)
      expect(hits[0]?.values.map((one) => one.key)).not.toContain(unshown.code)
    }
  })

  test("S-API-06: document の画面が operation を描き、色も付く", async ({ page }) => {
    await page.goto("/api/docs")

    // **operation が出るのは document を読めたときだけ。** 画面は JSON を自分で
    // 取りに行くので、指している先が違えば枠だけが残る
    const operations = page.locator("#swagger-ui .opblock")
    await expect(operations.first()).toBeVisible()
    expect(await operations.count()).toBeGreaterThan(1)

    // **stylesheet が `text/css` で届かなければブラウザは捨てる。** 画面は描かれた
    // ままなので見えるかどうかでは分からず、色が付いたかで見る
    const painted = await operations.first().evaluate((el) =>
      getComputedStyle(el).backgroundColor)
    expect(painted).not.toBe("rgba(0, 0, 0, 0)")
  })
})
