/**
 * The rules about spacing and shape that a reader would notice being broken.
 *
 * `app.contrast.test.ts` is the same idea for colour: a requirement nobody can
 * check by looking at one screen, held by something that reads the source. What
 * is here is the pair of rules that kept slipping — the screens each carrying
 * their own margins, and the same box being drawn with a different corner in
 * every file (`docs/ui.md`).
 */

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

const ROOT = path.join(import.meta.dirname)

/**
 * The screens a reader sees. The eighteen management screens are not here yet —
 * they are the next thing to be rebuilt, and holding them to a rule they carry
 * 93 breaches of would mean a red test for as long as that takes. **Their frame
 * is**, in `MANAGEMENT_FRAME` below: the part that was written after the rule
 * was, and the part a screen added later inherits without reading it.
 */
const PUBLIC_SCREENS = [
  "home",
  "research-list",
  "research",
  "research-version",
  "research-versions",
  "dataset-list",
  "dataset",
  "cart",
  "news",
  "news-item",
  "data-submission",
  "data-use",
  "contact-us",
  "document",
  "preview",
  "preview-dataset",
]

/** Every class list written in a file, attribute by attribute. */
function classLists(source: string): string[] {
  const found: string[] = []
  const attribute = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g
  let match = attribute.exec(source)
  while (match !== null) {
    found.push(match[1] ?? match[2] ?? match[3] ?? "")
    match = attribute.exec(source)
  }
  return found
}

async function sourcesUnder(dir: string): Promise<{ name: string, text: string }[]> {
  const entries = await readdir(path.join(ROOT, dir))
  const wanted = entries.filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
  return Promise.all(wanted.map(async (name) => ({
    name: `${dir}/${name}`,
    text: await readFile(path.join(ROOT, dir, name), "utf8"),
  })))
}

/**
 * What every management screen is drawn inside, and the one screen the portal
 * put there itself. Widening this list is what finishing the eighteen looks
 * like (`../.claude` の roadmap は U4 と呼んでいる).
 */
const MANAGEMENT_FRAME = [
  "routes/admin-layout.tsx",
  "routes/admin-assistant.tsx",
  "components/admin.tsx",
]

const MARGIN = /^(sm:|md:|lg:|first:|last:)*-?(mt|mb|my|space-y)-/

function marginsIn(text: string): string[] {
  return classLists(text).flatMap((list) => list.split(/\s+/).filter((one) => MARGIN.test(one)))
}

describe("縦の間隔", () => {
  it("公開画面が margin を書かず、間隔は Stack が持つ", async () => {
    const offenders: string[] = []
    for (const screen of PUBLIC_SCREENS) {
      const text = await readFile(path.join(ROOT, "routes", `${screen}.tsx`), "utf8")
      const hits = marginsIn(text)
      if (hits.length > 0) offenders.push(`${screen}.tsx: ${hits.join(" ")}`)
    }
    expect(offenders).toEqual([])
  })

  it("管理画面の器も margin を書かない", async () => {
    const offenders: string[] = []
    for (const file of MANAGEMENT_FRAME) {
      const hits = marginsIn(await readFile(path.join(ROOT, file), "utf8"))
      if (hits.length > 0) offenders.push(`${file}: ${hits.join(" ")}`)
    }
    expect(offenders).toEqual([])
  })
})

/**
 * The width of a management screen is the area's, set once by the shell
 * (`routes/admin-layout.tsx`). A screen that named its own would be the one
 * screen not to move when the area's answer changed.
 */
describe("管理画面の幅", () => {
  it("画面が自分で幅を書かない", async () => {
    const entries = (await readdir(path.join(ROOT, "routes")))
      .filter((name) => name.startsWith("admin") && name.endsWith(".tsx")
        && !name.includes(".test.") && name !== "admin-layout.tsx")
    const offenders: string[] = []
    for (const name of entries) {
      const text = await readFile(path.join(ROOT, "routes", name), "utf8")
      if (/<Page\s+width=/.test(text)) offenders.push(`${name}: <Page width=…>`)
      for (const list of classLists(text)) {
        const hits = list.split(/\s+/).filter((one) =>
          /^(sm:|md:|lg:)*max-w-(content-max|content-narrow|[0-9]|screen|prose)/.test(one))
        if (hits.length > 0) offenders.push(`${name}: ${hits.join(" ")}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("管理画面だけが使う部品も幅を書かない", async () => {
    const parts = ["components/editor.tsx", "components/dataset-editor.tsx",
      "components/publish.tsx", "components/review.tsx"]
    const offenders: string[] = []
    for (const file of parts) {
      const text = await readFile(path.join(ROOT, file), "utf8")
      for (const list of classLists(text)) {
        // `max-w-md` on a field inside a form is that field's width, not the
        // page's; what is refused is a measure for the screen as a whole.
        const hits = list.split(/\s+/).filter((one) =>
          /^(sm:|md:|lg:)*max-w-(content-max|content-narrow|[0-9]|screen|prose)/.test(one))
        if (hits.length > 0) offenders.push(`${file}: ${hits.join(" ")}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

/**
 * The corners a box may have (`docs/ui.md`). `rounded` and `rounded-full` are
 * the two anything may take; `rounded-lg` belongs to the one block large enough
 * for a 4px corner to disappear on it — the ways in on the front page — so it
 * is allowed where the parts are written and refused where the screens are.
 */
const CHOSEN_CORNER = /^(sm:|md:|lg:|hover:|group-open:)*rounded-(sm|md|xl|2xl|3xl|none)$/
const LARGE_CORNER = /^(sm:|md:|lg:|hover:|group-open:)*rounded-lg$/

describe("角丸", () => {
  it("大きさを選べる角丸を使わない", async () => {
    const sources = [...await sourcesUnder("components"), ...await sourcesUnder("routes")]
    const offenders: string[] = []
    for (const { name, text } of sources) {
      for (const list of classLists(text)) {
        const hits = list.split(/\s+/).filter((one) => CHOSEN_CORNER.test(one))
        if (hits.length > 0) offenders.push(`${name}: ${hits.join(" ")}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("画面が大きい角丸を書かない", async () => {
    const offenders: string[] = []
    for (const { name, text } of await sourcesUnder("routes")) {
      for (const list of classLists(text)) {
        const hits = list.split(/\s+/).filter((one) => LARGE_CORNER.test(one))
        if (hits.length > 0) offenders.push(`${name}: ${hits.join(" ")}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe("文字の大きさ", () => {
  it("スケールの外の値を書かない", async () => {
    const sources = [...await sourcesUnder("components"), ...await sourcesUnder("routes")]
    const offenders: string[] = []
    for (const { name, text } of sources) {
      for (const list of classLists(text)) {
        const hits = list.split(/\s+/).filter((one) => one.startsWith("text-["))
        if (hits.length > 0) offenders.push(`${name}: ${hits.join(" ")}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
