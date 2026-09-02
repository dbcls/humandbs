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
 * the two anything may take; `rounded-lg` belongs to what a 4px corner
 * disappears on — the ways in on the front page, and the listing tabs, which
 * carry no edge and sit against a face barely lighter than their own — so it is
 * allowed where the parts are written and refused where the screens are.
 *
 * **Naming a corner does not get a utility out of either rule.** `rounded-tr-lg`
 * is `rounded-lg` on one corner, and a screen that wrote it would otherwise
 * have slipped past a pattern that only matched the whole box.
 */
const CORNER = String.raw`(t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee)-`
const VARIANT = String.raw`(sm:|md:|lg:|hover:|group-open:)*`
const CHOSEN_CORNER = new RegExp(
  String.raw`^${VARIANT}rounded-(${CORNER})?(sm|md|xl|2xl|3xl|none)$`,
)
const LARGE_CORNER = new RegExp(String.raw`^${VARIANT}rounded-(${CORNER})?lg$`)

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

/**
 * The tab strip's own arithmetic.
 *
 * A tab's slope is the left edge of a strip sheared about its bottom-right
 * corner, so the strip's top edge sits `tan(angle) x height` to the right of
 * where it started. **A strip narrower than that never reaches the tab's own
 * left edge at the top**, and the silhouette up there becomes the box's square
 * corner standing beside the rounded one — with a wedge of the page showing
 * between this tab and the one behind it, since the strip is also what laps
 * over that join.
 *
 * Nothing about this is visible in the class list: it is three values in two
 * files that have to agree, and it has broken twice — once when the tabs grew
 * from the 30px they were copied at to the height of everything that can be
 * pressed, and once when the corner grew and made the first break legible.
 */
/**
 * The frozen column of a listing draws its edge with a shadow, and a table
 * whose borders are collapsed paints its cells as part of its own background —
 * where a shadow asked for on a cell never reaches the screen. **Nothing about
 * that shows up anywhere it can be seen from**: the computed style still
 * carries the shadow, so the only way to notice is to measure the colour of the
 * pixels that should have been shaded (`docs/ui.md`).
 */
/**
 * A column's floor belongs to `Td`'s own prop, not to the class list beside it.
 * Two `min-w-*` rules of equal weight are settled by whichever Tailwind emitted
 * last, so writing one in `className` beside the default made widening a column
 * appear to work and narrowing one do nothing at all (`docs/ui.md`).
 */
describe("列の下限", () => {
  it("セルが className で min-width を書かない", async () => {
    const files = [
      ...await sourcesUnder("routes"),
      ...await sourcesUnder("components"),
    ]
    for (const file of files) {
      const hits = file.text.match(/<Td\b[^>]*className=(?:"|\{`)[^">]*min-w-/g) ?? []
      expect({ file: file.name, hits }).toEqual({ file: file.name, hits: [] })
    }
  })
})

describe("表の縁", () => {
  it("表が、セルの影を描けない引き方をしない", async () => {
    const parts = await readFile(path.join(ROOT, "components/page.tsx"), "utf8")
    expect(parts).not.toMatch(/\bborder-collapse\b/)
    expect(parts).toMatch(/\bborder-separate\b/)
  })
})

describe("タブの斜辺", () => {
  it("帯が、せん断が動かす分より広い", async () => {
    const { width, shear } = await slope()
    expect(width).toBeGreaterThan(shear)
  })

  /**
   * An arc begins a radius away from the corner it rounds, so the strip has to
   * stand at least that far clear of the box before the corner can be the thing
   * that draws the silhouette. Short of it, the first pixels down from the top
   * are the box's own square edge — a nub beside the curve.
   */
  it("帯の張り出しが、その角丸より大きい", async () => {
    const { width, shear, radius } = await slope()
    expect(width - shear).toBeGreaterThan(radius)
  })
})

/** The three numbers the slope is made of, read from where each one lives. */
async function slope(): Promise<{ width: number, shear: number, radius: number }> {
  const parts = await readFile(path.join(ROOT, "components/base.tsx"), "utf8")
  const angle = /-skew-x-\[(\d+(?:\.\d+)?)deg\]/.exec(parts)?.[1]
  const strip = /before:w-(\d+(?:\.\d+)?)\b/.exec(parts)?.[1]
  const corner = /before:rounded-tl(-(xs|sm|md|lg|xl))?\b/.exec(parts)
  const theme = await readFile(path.join(ROOT, "app.css"), "utf8")
  const tap = /--spacing-tap:\s*(\d+(?:\.\d+)?)(rem|px)/.exec(theme)
  expect([angle, strip, corner, tap]).not.toContain(undefined)

  const RADIUS: Record<string, number> = { xs: 2, sm: 2, md: 6, lg: 8, xl: 12 }
  const height = Number(tap?.[1]) * (tap?.[2] === "rem" ? 16 : 1)
  return {
    // Tailwind's spacing step is 4px, which is what `before:w-6` counts in.
    width: Number(strip) * 4,
    shear: Math.tan((Number(angle) * Math.PI) / 180) * height,
    radius: RADIUS[corner?.[2] ?? ""] ?? 4,
  }
}
