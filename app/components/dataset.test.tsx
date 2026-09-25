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

  it("offers the list of the files' addresses only where it is given one", () => {
    const Stub = createRoutesStub([{
      path: "/*",
      Component: () => (
        <DatasetBody view={view(1)} locale="ja" researchHref="/research/hum0001" urlList="/dataset/NHA000001/files.txt" />
      ),
    }])

    expect(renderToStaticMarkup(<Stub initialEntries={["/dataset/NHA000001"]} />)).toContain("href=\"/dataset/NHA000001/files.txt\"")
    expect(render(1)).not.toContain("files.txt")
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
