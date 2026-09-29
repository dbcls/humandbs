import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { docsPage } from "./docs"
import { API_ENDPOINTS, DOCS_PATH, OPENAPI_PATH } from "./endpoints"
import { API_TITLE, documentPath } from "./openapi"
import { llmsText } from "./overview"

const ORIGIN = fc.webUrl({ withFragments: false, withQueryParameters: false })
  .map((url) => new URL(url).origin)

describe("the API documentation page, read without running its script", () => {
  it("names the OpenAPI document as the page's service description", async () => {
    const html = await docsPage().text()
    expect(html).toContain(`<link rel="service-desc" type="application/vnd.oai.openapi+json;version=3.1" href="/${OPENAPI_PATH}">`)
    expect(html).toContain(`<title>${API_TITLE}</title>`)
  })

  it("lists every endpoint with its summary inside the element Swagger UI draws over, and links the document", async () => {
    const html = await docsPage().text()
    const drawnOver = /<div id="swagger-ui">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ""
    expect(drawnOver).toContain(`<a href="/${OPENAPI_PATH}">`)
    for (const endpoint of API_ENDPOINTS) {
      expect(drawnOver).toContain(`<code>GET ${documentPath(endpoint.path)}</code>: ${endpoint.summary}`)
    }
  })
})

describe("/llms.txt", () => {
  it("opens with the site's name and a line on what it is, the way llms.txt is read", () => {
    const [title, blank, summary] = llmsText("https://humandbs.dbcls.jp").split("\n")
    expect(title).toBe("# NBDC Human Database")
    expect(blank).toBe("")
    expect(summary?.startsWith("> ")).toBe(true)
  })

  it("links the document and its page on the deployment's own origin, and lists every endpoint", () => {
    fc.assert(fc.property(ORIGIN, (origin) => {
      const text = llmsText(origin)
      expect(text).toContain(`(${origin}/${OPENAPI_PATH})`)
      expect(text).toContain(`(${origin}/${DOCS_PATH})`)
      for (const target of text.matchAll(/\]\(([^)]*)\)/g)) expect(target[1]?.startsWith(`${origin}/`)).toBe(true)
      for (const endpoint of API_ENDPOINTS) expect(text).toContain(`- \`GET ${documentPath(endpoint.path)}\`: ${endpoint.summary}`)
    }))
  })
})
