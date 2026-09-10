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

/** The screens a reader sees. The management area is `managementFiles` below. */
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
 * The management area: every screen under `/admin`, the frame they are drawn
 * in, and the parts only they use. **The screens are found rather than listed**,
 * so one added later is held to the rule without anybody remembering to name it
 * here.
 *
 * **`components/preview.tsx` is deliberately absent.** It draws the marks a
 * reader of a shared draft sees, and those take a negative margin so that a
 * 36px control rides inside the row the words set (`docs/ui.md` の「押せるものの
 * 大きさ」). The rule below cannot tell that apart from a screen choosing a
 * distance of its own.
 */
const MANAGEMENT_PARTS = [
  "components/admin.tsx",
  "components/comments.tsx",
  "components/contents.tsx",
  "components/dataset-editor.tsx",
  "components/draft-tools.tsx",
  "components/editor.tsx",
  "components/field-review.tsx",
  "components/fields.tsx",
  "components/files.tsx",
  "components/form.tsx",
  "components/previous.tsx",
  "components/publish.tsx",
  "components/review.tsx",
  "components/upstream.tsx",
]

async function managementFiles(): Promise<string[]> {
  const screens = (await readdir(path.join(ROOT, "routes")))
    .filter((name) => name.startsWith("admin") && name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => `routes/${name}`)
  return [...screens, ...MANAGEMENT_PARTS]
}

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

  it("管理画面も margin を書かず、間隔は Stack が持つ", async () => {
    const offenders: string[] = []
    for (const file of await managementFiles()) {
      const hits = marginsIn(await readFile(path.join(ROOT, file), "utf8"))
      if (hits.length > 0) offenders.push(`${file}: ${hits.join(" ")}`)
    }
    expect(offenders).toEqual([])
  })

  /**
   * カードの中でいちばん外側にある `Stack` は、h1 とその下に続くものの距離を
   * 決めている。ここだけが `normal` の画面があると、同じ関係が 32px と 16px の
   * 2 通りになり、画面を渡り歩く人には理由の無い差として残る。
   *
   * **絞り込み pane を持つ一覧だけが `normal`。** h1 の下に来るのが節ではなく
   * pane の見出しで、見出しが 2 つ続く形に節と節の距離を空けると h1 だけが浮く。
   * 公開側の一覧も同じ理由で `normal` で、両者は同じ形の 2 つの面になる。
   */
  it("管理画面のカードは block で始まる — 絞り込む一覧だけが normal", async () => {
    const offenders: string[] = []
    for (const file of await managementFiles()) {
      const text = await readFile(path.join(ROOT, file), "utf8")
      const wanted = /<RefinableList\b/.test(text) ? "normal" : "block"
      for (const found of text.matchAll(/<Card\b[^>]*>\s*<Stack gap="(\w+)"/g)) {
        if (found[1] !== wanted) offenders.push(`${file}: ${found[1]} (${wanted} を待つ)`)
      }
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

  /**
   * The inner outline of a box that carries a line is rounded by the radius
   * less the width of the line: 3px inside a 4px box drawn with 1px. A band
   * given the same `rounded-t` is a pixel rounder than the corner it sits in,
   * and the ground shows through the crescent between them. The box clips it
   * instead, which is the one radius that cannot disagree with itself.
   */
  it("線を持つ箱に敷いた帯は、箱の側で切る", async () => {
    const nested = /className="([^"]*\bborder\b[^"]*)"\s*>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<Band\b([^>]*)>/g
    const sources = [...await sourcesUnder("components"), ...await sourcesUnder("routes")]
    const found: string[] = []
    const offenders: string[] = []
    for (const { name, text } of sources) {
      let match = nested.exec(text)
      while (match !== null) {
        const box = match[1] ?? ""
        const band = match[2] ?? ""
        found.push(`${name}: ${box}`)
        if (!box.split(/\s+/).includes("overflow-hidden")) offenders.push(`${name}: ${box}`)
        if (/\brounded/.test(band)) offenders.push(`${name}: <Band${band}>`)
        match = nested.exec(text)
      }
    }
    expect(found.length).toBeGreaterThan(0)
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

/**
 * What can be pressed on the control welded to a `Chooser` is stated, not
 * measured off the box it sits in. Written as an inset it followed the pill
 * silently: a step of padding off the value beside it and the 36px this has to
 * reach became 34.4, with nothing on the screen to say so (`docs/ui.md`).
 */
describe("溶接された操作の押せる範囲", () => {
  it("器の高さから引き算せず、36px を名乗る", async () => {
    const parts = await readFile(path.join(ROOT, "components/base.tsx"), "utf8")
    const side = /export const CHOOSER_SIDE\s*=\s*"([^"]*)"/.exec(parts)?.[1]
    expect(side).toBeDefined()
    expect(side).toContain("after:h-tap")
    expect(side).not.toMatch(/after:-?inset-y-/)
  })
})

/**
 * The bar at the top is one part in two states — a public page draws the
 * navigation, a management screen does not — so what stands in its row has to
 * be one height. The pills, the cart and the account are 36px; a destination
 * left on its own line box came to 38.4 and made the header 2.4px taller
 * wherever the navigation was drawn, carrying the wordmark, its name and the
 * controls 1.2px with it (`docs/ui.md`). **Two and a half pixels are not
 * something looking at it finds**, which is why the height is read out of the
 * source instead.
 */
describe("ヘッダの行の高さ", () => {
  it("バーの行き先が、隣に並ぶものと同じ 36px に立つ", async () => {
    const parts = await readFile(path.join(ROOT, "components/layout.tsx"), "utf8")
    for (const name of ["NAV_ITEM", "NAV_ITEM_HERE"]) {
      const look = new RegExp(String.raw`const ${name}\s*=\s*"([^"]*)"`).exec(parts)?.[1]
      expect(look).toBeDefined()
      expect(look).toContain("h-tap")
      // The height is the class, not a line box plus padding.
      expect(look).not.toMatch(/\bpy-/)
    }
  })
})

/**
 * A part of a page and a part of an article are named by the same level of
 * heading, so a reader moving between them meets one h2 rather than two
 * (`docs/ui.md`). **The size and the mark are what they share; the colour is
 * not.** The pair is written in two files — one a component, one a
 * stylesheet — which is the only reason it can drift.
 */
describe("見出しの段", () => {
  it("節の名前は、部品と記事で同じ大きさと棒を取る", async () => {
    const parts = await readFile(path.join(ROOT, "components/page.tsx"), "utf8")
    const styles = await readFile(path.join(ROOT, "app.css"), "utf8")
    const section = /<h2 className="([^"]*)"/.exec(parts)?.[1]
    const article = /\.markdown h2 \{ @apply ([^;]*);/.exec(styles)?.[1]
    expect([section, article]).not.toContain(undefined)

    for (const look of ["text-lg", "border-l-4", "pl-2.5"]) {
      expect(section).toContain(look)
      expect(article).toContain(look)
    }
  })

  /**
   * An article is running prose full of links, so a coloured line in one is
   * read as a link before it is read as a heading. Colour is left to links and
   * the mark says "heading" instead — which also means every rung holds the
   * same weight, since weight is then the only thing separating a heading from
   * the paragraph under it.
   */
  it("記事の見出しは色を持たず、weight も段で変えない", async () => {
    const styles = await readFile(path.join(ROOT, "app.css"), "utf8")
    for (const level of ["h2", "h3"]) {
      const look = new RegExp(String.raw`\.markdown ${level} \{ @apply ([^;]*);`).exec(styles)?.[1]
      expect(look).toBeDefined()
      expect(look).not.toMatch(/\btext-(brand|brand-light|accent|deep)\b/)
      expect(look).not.toMatch(/\bfont-(light|normal|medium)\b/)
    }
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

/**
 * **件数とページ送りは 1 つのまとまり。** どちらも「いま何ページ目の何件を見ているか」に答えるので、
 * 同じ器に立つ (`docs/public-pages.md` の「並びと件数」)。**それを守らせる方法は「近くに書く」ではなく
 * 「1 か所でしか書けないようにする」** — 件数を各画面が書いていた間、5 つの管理画面が 5 通りの
 * 出し方をしていて、うち 2 つは何も出していなかった。
 */
describe("一覧の件数とページ送り", () => {
  it("件数を出すのは Paging だけ", async () => {
    const sources = [...await sourcesUnder("components"), ...await sourcesUnder("routes")]
    const writers = sources
      .filter(({ text }) => /messages\.search\.(range|results)\b/.test(text))
      .map(({ name }) => name)
      .sort()
    // カートだけは別: ページに切られないので、答えは範囲ではなく総数そのもの。
    expect(writers).toEqual(["components/page.tsx", "routes/cart.tsx"])
  })

  it("その Paging の中で、件数とページ送りが同じ器に立つ", async () => {
    const parts = await readFile(path.join(ROOT, "components/page.tsx"), "utf8")
    const box = /export function Paging[\s\S]*?<div className="([^"]*)">/.exec(parts)?.[1]
    expect(box).toBeDefined()
    expect(box?.split(/\s+/)).toContain("gap-2")
  })

  it("ページ送りを描くのも Paging だけ", async () => {
    const sources = [...await sourcesUnder("components"), ...await sourcesUnder("routes")]
    const writers = sources
      .filter(({ text }) => /<PageLinks\b/.test(text))
      .map(({ name }) => name)
      .sort()
    expect(writers).toEqual(["components/page.tsx", "routes/dev-ui.tsx"])
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

/**
 * Every `.tsx` under `app/`, screens and parts alike. The rules below are about
 * what a control looks like, and a part draws controls as readily as a screen.
 */
async function everySource(): Promise<{ name: string, text: string }[]> {
  const dirs = ["components", "routes", "public", "admin", "cart", "files", "review", "search"]
  const found = await Promise.all(dirs.map(async (dir) => {
    try {
      return await sourcesUnder(dir)
    } catch {
      return []
    }
  }))
  return found.flat()
}

describe("ボタンの面と形", () => {
  /**
   * The round end is where a control stands, not how it should look — the band
   * of controls above a listing, and nowhere else (`base.tsx` の `ButtonLook`).
   * Asked for as a taste it had spread to five places that are not a listing,
   * and the shape had stopped saying anything.
   */
  it("丸いのは一覧の帯にいるものだけ", async () => {
    const wearing = (await everySource())
      .filter(({ text }) => /<Button(?:Link)?\b[^>]*\slisting\b/s.test(text))
      .map(({ name }) => name)
      .sort()
    expect(wearing).toEqual(["components/search.tsx", "routes/dev-ui.tsx"])
  })

  /**
   * **The filled face is the one thing a screen is asking for**, so a file that
   * draws two of them has stopped ranking anything. Counted per file rather than
   * per screen because a part is drawn inside whichever screen imports it; the
   * catalogue is exempt, being a page of samples rather than a screen with an
   * errand.
   *
   * **A face chosen in an expression counts the same as one written out.** Read
   * for the literal alone, a switch handing `primary` to whichever option is
   * current passed as a single filled button and drew one per field.
   */
  it("塗りの面は 1 つのファイルに 1 つまで", async () => {
    const filled = /variant=(?:"primary"|\{[^}]*"primary"[^}]*\})/g
    const twice = (await everySource())
      .filter(({ name }) => !name.includes("dev-ui"))
      .map(({ name, text }) => ({ name, n: (text.match(filled) ?? []).length }))
      .filter(({ n }) => n > 1)
    expect(twice).toEqual([])
  })

  /**
   * **What is chosen is not what should be pressed.** A state wearing a face
   * spends the ranking the faces exist to carry, so the control that holds one
   * is `Choice`, whose options divide a box rather than standing as buttons of
   * their own.
   */
  it("選んだ状態を Button の面で言わない", async () => {
    const wearing = (await everySource())
      .filter(({ text }) => /<Button(?:Link)?\b[^>]*\saria-pressed\b/s.test(text))
      .map(({ name }) => name)
    expect(wearing).toEqual([])
  })

  /** The palette itself, so that a face nobody uses cannot quietly come back. */
  it("面は 4 つしかない", async () => {
    const parts = await readFile(path.join(ROOT, "components/base.tsx"), "utf8")
    const union = /export type ButtonVariant = ([^\n]*)/.exec(parts)?.[1]
    expect(union?.match(/"[a-z]+"/g)).toEqual(["\"primary\"", "\"secondary\"", "\"danger\"", "\"ghost\""])
  })
})
