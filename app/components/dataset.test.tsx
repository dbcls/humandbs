import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { FILES_PAGE_SIZE } from "~/files/prefix"
import type { DatasetView } from "~/public/view.server"

import { DatasetBody } from "./dataset"

function view(fileCount: number, secondaryLabels: string[] = []): DatasetView {
  return {
    label: "NHA000001",
    humLabel: "hum0001",
    studyAccession: null,
    secondaryLabels,
    datePublished: null,
    dateModified: null,
    accessType: null,
    typeOfData: null,
    untranslated: false,
    experiments: [],
    files: Array.from({ length: fileCount }, (_, at) => ({
      name: `f${String(at + 1).padStart(3, "0")}.txt`,
      size: 1,
      isPublic: true,
      label: "",
    })),
  }
}

function render(fileCount: number, address = "/dataset/NHA000001"): string {
  const Stub = createRoutesStub([{
    path: "/*",
    Component: () => <DatasetBody view={view(fileCount)} locale="ja" researchHref="/research/hum0001" />,
  }])
  return renderToStaticMarkup(<Stub initialEntries={[address]} />)
}

function names(html: string): string[] {
  return [...html.matchAll(/f\d{3}\.txt(?=<)/g)].map((match) => match[0])
}

describe("a dataset's files", () => {
  it("draws every file, and no count or page steps, while they fit on one page", () => {
    const html = render(FILES_PAGE_SIZE)
    expect(names(html)).toHaveLength(FILES_PAGE_SIZE)
    expect(html).not.toContain(`/ ${FILES_PAGE_SIZE} 件`)
    expect(html).not.toContain("?files=")
  })

  it("paginates at the page size and pages past it, with the count", () => {
    const html = render(FILES_PAGE_SIZE + 1)
    expect(names(html)).toHaveLength(FILES_PAGE_SIZE)
    expect(html).toContain(`1–${FILES_PAGE_SIZE} / ${FILES_PAGE_SIZE + 1} 件`)
    expect(html).toContain("?files=2")
  })

  it("draws the page the address requests", () => {
    const html = render(FILES_PAGE_SIZE + 1, "/dataset/NHA000001?files=2")
    expect(names(html)).toEqual([`f${String(FILES_PAGE_SIZE + 1).padStart(3, "0")}.txt`])
  })

  it("holds as many files on a page as the address asks for", () => {
    expect(names(render(60, "/dataset/NHA000001?fileRows=50"))).toHaveLength(50)
  })

  it("reads a page size the list does not offer as the default one", () => {
    expect(names(render(60, "/dataset/NHA000001?fileRows=30"))).toHaveLength(FILES_PAGE_SIZE)
  })

  it("offers the list of the files' addresses and a copy of each only where it is given where they are fetched from", () => {
    const Stub = createRoutesStub([{
      path: "/*",
      Component: () => (
        <DatasetBody
          view={view(1)}
          locale="ja"
          researchHref="/research/hum0001"
          fileUrls={{ list: "/dataset/NHA000001/files.txt", origin: "https://humandbs.example" }}
        />
      ),
    }])
    const html = renderToStaticMarkup(<Stub initialEntries={["/dataset/NHA000001"]} />)

    expect(html).toContain("href=\"/dataset/NHA000001/files.txt\"")
    expect(html).toContain("URL のコピー")
    expect(render(1)).not.toContain("files.txt")
    expect(render(1)).not.toContain("URL のコピー")
  })

  it("puts the list of the files' addresses on the section's name row, outside the name and above the table", () => {
    const Stub = createRoutesStub([{
      path: "/*",
      Component: () => (
        <DatasetBody
          view={view(1)}
          locale="ja"
          researchHref="/research/hum0001"
          fileUrls={{ list: "/dataset/NHA000001/files.txt", origin: "https://humandbs.example" }}
        />
      ),
    }])
    const html = renderToStaticMarkup(<Stub initialEntries={["/dataset/NHA000001"]} />)
    const nameEnds = html.indexOf(">このデータセットに紐づく非制限公開ファイル</h2>")

    expect(nameEnds).toBeGreaterThan(0)
    expect(html.indexOf("files.txt")).toBeGreaterThan(nameEnds)
    expect(html.indexOf("files.txt")).toBeLessThan(html.indexOf("<table", nameEnds))
  })

  it("reads an address it cannot read as the nearest page, and never loses or repeats a file", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 3 * FILES_PAGE_SIZE }),
      fc.oneof(fc.integer({ min: -2, max: 6 }).map(String), fc.constantFrom("x", "1.5", "")),
      (count, asked) => {
        const shown = names(render(count, `/dataset/NHA000001?files=${asked}`))
        expect(shown.length).toBeGreaterThan(0)
        expect(shown.length).toBeLessThanOrEqual(FILES_PAGE_SIZE)
        expect(new Set(shown).size).toBe(shown.length)
      },
    ), { numRuns: 40 })
  })
})

describe("a dataset's entry in DDBJ Search", () => {
  function page(label: string): string {
    const Stub = createRoutesStub([{
      path: "/*",
      Component: () => <DatasetBody view={{ ...view(0), label }} locale="ja" researchHref="/research/hum0001" />,
    }])
    return renderToStaticMarkup(<Stub initialEntries={[`/dataset/${label}`]} />)
  }

  it("links a dataset DDBJ Search holds to its entry, under DDBJ Search, in a new tab", () => {
    const html = page("E-GEAD-1107")

    expect(html).toMatch(/DDBJ Search[\s\S]*<a[^>]*href="https:\/\/ddbj\.nig\.ac\.jp\/search\/entry\/gea\/E-GEAD-1107\/"[^>]*target="_blank"[^>]*>[\s\S]*E-GEAD-1107/)
  })

  it("has no DDBJ Search row for an id the portal issued", () => {
    expect(page("NHA000001")).not.toContain("DDBJ Search")
  })
})

describe("a dataset's secondary IDs", () => {
  function page(secondaryLabels: string[]): string {
    const Stub = createRoutesStub([{
      path: "/*",
      Component: () => <DatasetBody view={view(0, secondaryLabels)} locale="ja" researchHref="/research/hum0001" />,
    }])
    return renderToStaticMarkup(<Stub initialEntries={["/dataset/NHA000001"]} />)
  }

  it("lists the ids the dataset was known by before, under Secondary ID, without linking them", () => {
    const html = page(["hum0001.v1.freq.v1", "hum0001.v2.freq.v1"])

    expect(html).toMatch(/Secondary ID[\s\S]*hum0001\.v1\.freq\.v1, hum0001\.v2\.freq\.v1/)
    expect(html).not.toContain("href=\"/dataset/hum0001.v1.freq.v1\"")
  })

  it("has no Secondary ID row for a dataset that has none", () => {
    expect(page([])).not.toContain("Secondary ID")
  })
})
