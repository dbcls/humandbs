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

import { ACTION_ICON } from "~/components/icons"
import { messagesFor } from "~/i18n/messages"

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
 * **`components/preview.tsx` is deliberately absent.** It is the page a reader
 * of a shared draft sees, drawn with the public page's parts rather than the
 * management area's, so the card rule below is not its to keep.
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
  "components/upstream-merge.tsx",
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
   * **h1 の下に節の名前が来ない画面だけが `normal`。** 絞り込み pane を持つ
   * 一覧がそれで、下に来るのは節ではなく pane の見出し — 見出しが 2 つ続く形に
   * 節と節の距離を空けると h1 だけが浮く。公開側の一覧も同じ理由で `normal` で、
   * 両者は同じ形の 2 つの面になる。**`common/` の箱も同じ**
   * (`routes/admin-contents-files.tsx`)。節を 1 つも持たない画面で、h1 の下に
   * 来るのは upload の枠そのもの — 枠は自分の余白を持つので、32px を空けると
   * 字から字までは 48px になる。**アラートの画面も節を持たない**
   * (`routes/admin-contents-alert.tsx`)。h1 の下に来るのは 1 件目のアラートで、
   * それが開くのは名前ではなく自分の状態のチップ。
   *
   * **編集画面の頭の区画は `Card` ではなく自前の箱** (`components/draft-tools.tsx` の
   * `DraftHead`) で、この規則の外にある — 留まると道具の行 1 行に畳まれる箱で、行の
   * あいだは `Stack` の既定。**記事とお知らせの編集画面の頭の区画は `normal`**
   * (`useArticlePanes` を呼ぶ画面) — 名前の行と道具の行のあいだに、名前を持つ節
   * (バージョン管理・公開日時) が立つ。h1 の 8px 下に節の名前が乗ると h1 の 2 行目に
   * 読め、32px 空けると帯が節を持つ箱に見える。
   */
  it("管理画面のカードは block で始まる — 絞り込む一覧と編集画面のバーだけが違う", async () => {
    const offenders: string[] = []
    for (const file of await managementFiles()) {
      const text = await readFile(path.join(ROOT, file), "utf8")
      const sectionless = file.endsWith("admin-contents-alert.tsx")
      const wanted = /<RefinableList\b/.test(text) || sectionless || text.includes("= useArticlePanes(")
        ? "normal"
        : "block"
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
 * The vertical alignment of a row, the frozen columns, the sideways scrollbar
 * kept in sync with a second one above the fold — all of it lives in `Table` /
 * `Td`, and a screen that writes its own `<table>` gets none of it and answers
 * to no rule here either.
 */
describe("表そのもの", () => {
  it("<table を書くのは page.tsx の Table だけ", async () => {
    const files = [
      ...await sourcesUnder("routes"),
      ...await sourcesUnder("components"),
    ]
    for (const file of files) {
      if (file.name === "components/page.tsx") continue
      expect({ file: file.name, hasTable: /<table\b/.test(file.text) }).toEqual({ file: file.name, hasTable: false })
    }
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

/**
 * **畳んで開くパネルが閉じる 3 通り (Escape・外を押す・遷移) は `base.tsx` の `useDismissible` だけが持つ**
 * (`docs/ui.md` の「畳んで開くパネルは `Menu` から作る」)。パネルごとに書くと、どれか 1 つだけが閉じ方を
 * 1 つ欠いても、他のパネルと見比べるまで誰も気づかない。
 */
describe("パネルの閉じ方", () => {
  it("外を押したことを document で聞くのは useDismissible だけ", async () => {
    const sources = [...await sourcesUnder("components"), ...await sourcesUnder("routes")]
    const listeners = sources.flatMap(({ name, text }) =>
      [...text.matchAll(/document\.addEventListener\("(pointerdown|keydown)"/g)].map((found) => `${name} ${found[1]}`))
    expect(listeners.sort()).toEqual(["components/base.tsx keydown", "components/base.tsx pointerdown"])
    const base = await readFile(path.join(ROOT, "components/base.tsx"), "utf8")
    const hook = /export function useDismissible\(\)[\s\S]*?\n}\n/.exec(base)?.[0] ?? ""
    expect(hook).toContain("document.addEventListener(\"pointerdown\"")
    expect(hook).toContain("document.addEventListener(\"keydown\"")
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
   *
   * **`accent` is a fill and is not counted here**, because it is not the
   * screen ranking anything: it is worn by a save that is holding something
   * unsent, so how many appear is decided by what has been typed. A screen with
   * four things to edit can be waiting on all four.
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
    expect(union?.match(/"[a-z]+"/g))
      .toEqual(["\"primary\"", "\"accent\"", "\"secondary\"", "\"danger\""])
  })
})

describe("名前の行の並び", () => {
  /**
   * The kinds of thing that stand to the right of a screen's name, in the one
   * order they keep (`docs/ui.md` の「管理画面の枠」): the way out, the ways
   * elsewhere, what acts on the screen, and last what cannot be undone.
   * `Dialog` is counted as an act because the only ones on a name row open a
   * form that makes something.
   */
  const KIND = /<(AdminBack|ButtonLink|Submit|Dialog|Confirm)\b/g
  const RANK: Record<string, number> = { AdminBack: 0, ButtonLink: 1, Submit: 2, Dialog: 2, Confirm: 3 }

  /** Every `<Heading …>…</Heading>` with children, in the order the source draws them. */
  function nameRows(text: string): string[] {
    const rows: string[] = []
    const opening = /<Heading\b[^>]*>/g
    let match = opening.exec(text)
    while (match !== null) {
      if (!match[0].endsWith("/>")) {
        const close = text.indexOf("</Heading>", opening.lastIndex)
        if (close !== -1) rows.push(text.slice(opening.lastIndex, close))
      }
      match = opening.exec(text)
    }
    return rows
  }

  /**
   * Every `<Dialog …>…</Dialog>` (or `<Dialog … />`) drawn by a screen or a
   * part, as the text between the opening tag and its end.
   */
  function panels(text: string): string[] {
    const found: string[] = []
    const opening = /<Dialog\b/g
    let match = opening.exec(text)
    while (match !== null) {
      const selfClose = text.indexOf("/>", match.index)
      const close = text.indexOf("</Dialog>", match.index)
      const next = text.indexOf("<Dialog", match.index + 1)
      const end = close !== -1 && (next === -1 || close < next) ? close : selfClose
      found.push(text.slice(match.index, end))
      match = opening.exec(text)
    }
    return found
  }

  it("面の中で画面が文を書かず、足元の行も描かない — どちらも面のもの", async () => {
    const sources = [...await sourcesUnder("routes"), ...await sourcesUnder("components")]
      .filter(({ name }) => name !== "components/base.tsx")
    const sentences = sources
      .filter(({ text }) => panels(text).some((panel) => /<p\b/.test(panel)))
      .map(({ name }) => name)
    expect(sentences).toEqual([])
    const feet = sources
      .filter(({ text }) => panels(text).some((panel) => panel.includes("justify-end")))
      .map(({ name }) => name)
    expect(feet).toEqual([])
    // The rule has something to hold: there are panels to look into.
    expect(sources.flatMap(({ text }) => panels(text)).length).toBeGreaterThan(5)
  })

  it("値が無いセルを横棒で描かない — 語で言うか、空にするかの 2 つ", async () => {
    const sources = [...await sourcesUnder("routes"), ...await sourcesUnder("components")]
    // A dash handed over in place of a value (`?? "—"`, `|| "-"`), or drawn on
    // its own as an element's whole text. React keys are not shown to anyone,
    // and the en dash between the two ends of a range is a separator, not a
    // value, so only the em dash and the hyphen count when drawn alone.
    const dashed = sources
      .map(({ name, text }) => ({ name, text: text.replace(/key=\{[^}]*\}/g, "") }))
      .filter(({ text }) => /(?:\?\?|\|\|)\s*(?:<span[^>]*>)?["'`][—–-]["'`]/.test(text) || /<(?:>|span[^>]*>)[—-]<\//.test(text))
      .map(({ name }) => name)
    expect(dashed).toEqual([])
  })

  it("slug を打ち直す面は 1 つの部品で、画面が自分では描かない", async () => {
    const screens = await sourcesUnder("routes")
    // A screen that reaches for the panel's words is drawing the panel itself.
    const drawnByHand = screens
      .filter(({ text }) => /\bt\.(rename|renameTitle|renameWarning|renameConfirm)\b/.test(text))
      .map(({ name }) => name)
    expect(drawnByHand).toEqual([])
    const users = screens.filter(({ text }) => /<SlugEditor\b/.test(text)).map(({ name }) => name).sort()
    // The research box changes names on the same panel, from `components/files.tsx`.
    expect(users).toEqual(["routes/admin-contents-document.tsx", "routes/admin-contents-files.tsx"])
  })

  it("出る道、他所への道、この画面への操作、取り消せない操作の順に立つ", async () => {
    const screens = (await sourcesUnder("routes")).filter(({ name }) => name.startsWith("routes/admin"))
    const outOfOrder: { name: string, row: string[] }[] = []
    let rowsWithControls = 0
    for (const { name, text } of screens) {
      for (const row of nameRows(text)) {
        const kinds = [...row.matchAll(KIND)].map((one) => one[1] ?? "")
        if (kinds.length === 0) continue
        rowsWithControls += 1
        const ranks = kinds.map((kind) => RANK[kind] ?? -1)
        if (ranks.some((rank, i) => i > 0 && rank < (ranks[i - 1] ?? 0))) outOfOrder.push({ name, row: kinds })
      }
    }
    expect(outOfOrder).toEqual([])
    // The rule has something to hold: the rows it reads are the ones with
    // more than the name on them.
    expect(rowsWithControls).toBeGreaterThan(10)
  })

  /**
   * The draft's two rows keep their own order in one row each, instead of a
   * `Heading`'s children (`docs/ui.md` の「管理画面の枠」). Neither is a
   * `nameRows` row — the head's own `Heading` is self-closing, and the tools
   * row is not a `Heading` at all — so both are checked here by where each
   * part sits in `draft-tools.tsx`'s own markup.
   */
  it("DraftHead の行は出る道 1 本だけを持つ — 事実は 2 行目、名前の行には無い", async () => {
    const text = await readFile(path.join(ROOT, "components/draft-tools.tsx"), "utf8")
    const start = text.indexOf("export function DraftHead")
    expect(start).toBeGreaterThan(-1)
    const end = text.indexOf("export function DraftTools", start)
    const body = text.slice(start, end)
    expect([...body.matchAll(/<AdminBack\b/g)]).toHaveLength(1)
  })

  it("DraftTools の行は、保存・その状態・面の入口・切り替えの順に並ぶ", async () => {
    const text = await readFile(path.join(ROOT, "components/draft-tools.tsx"), "utf8")
    const start = text.indexOf("export function DraftTools")
    expect(start).toBeGreaterThan(-1)
    const body = text.slice(start)
    const save = body.indexOf("variant=\"accent\"")
    const status = body.indexOf("role=\"status\"")
    const unresolved = body.indexOf("{notes}")
    const control = body.indexOf("{panesControl}")
    expect(save).toBeGreaterThan(-1)
    expect(status).toBeGreaterThan(save)
    expect(unresolved).toBeGreaterThan(status)
    expect(control).toBeGreaterThan(unresolved)
  })
})

/**
 * `Dialog` and `Confirm` build the panel themselves — the name, the panel's
 * own sentence, the fields, the foot — at one width, whatever screen opens
 * one (`docs/ui.md` の「押せるもの」). What follows reads the source for the
 * ways a screen could still take that back: choosing its own width, writing
 * `<dialog>` by hand, naming the panel after a bare value instead of a word,
 * or a sentence that does not close the way one does.
 */
describe("面の幅・文・見出し", () => {
  /** A `<Dialog …>` / `<Confirm …>` opening tag, read past any `{…}` inside it
   * so a `>` in an expression (`() =>`, a nested `<Icon />`) is not mistaken
   * for the tag's own end. */
  function openingTagsOf(text: string, kinds: string[]): { kind: string, tag: string }[] {
    const found: { kind: string, tag: string }[] = []
    const opening = new RegExp(`<(${kinds.join("|")})\\b`, "g")
    let match = opening.exec(text)
    while (match !== null) {
      let depth = 0
      let end = text.length
      for (let i = match.index; i < text.length; i += 1) {
        const ch = text[i]
        if (ch === "{") depth += 1
        else if (ch === "}") depth -= 1
        else if (ch === ">" && depth === 0) {
          end = i + 1
          break
        }
      }
      found.push({ kind: match[1] ?? "", tag: text.slice(match.index, end) })
      match = opening.exec(text)
    }
    return found
  }

  /** An attribute's value, written either as a literal string or a `{…}` expression. */
  function attrOf(tag: string, name: string): { form: "literal" | "expr", value: string } | undefined {
    const literal = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)
    if (literal !== null) return { form: "literal", value: literal[1] ?? "" }
    const start = new RegExp(`\\b${name}=\\{`).exec(tag)
    if (start === null) return undefined
    const from = start.index + start[0].length
    let depth = 1
    let i = from
    for (; i < tag.length; i += 1) {
      if (tag[i] === "{") depth += 1
      else if (tag[i] === "}") {
        depth -= 1
        if (depth === 0) break
      }
    }
    return { form: "expr", value: tag.slice(from, i) }
  }

  /**
   * Every screen and part that could open one, minus the two places this rule
   * does not reach: `base.tsx` draws the one panel there is, and `fields.tsx`'s
   * `ItemList` names a repeated element by what kind of thing it is, not by an
   * object and an act on it (`docs/ui.md` の「押せるもの」の「繰り返しの要素」) —
   * its title is the list's own word for an empty element, or the element's own
   * summary once one is typed, neither of which is a bare identifier.
   */
  async function dialogSources(): Promise<{ name: string, text: string }[]> {
    return [...await sourcesUnder("routes"), ...await sourcesUnder("components")]
      .filter(({ name }) => name !== "components/base.tsx" && name !== "components/fields.tsx")
  }

  it("画面と部品は Dialog / Confirm に幅を渡さない", async () => {
    const offenders: string[] = []
    let total = 0
    for (const { name, text } of await dialogSources()) {
      for (const { tag } of openingTagsOf(text, ["Dialog", "Confirm"])) {
        total += 1
        if (/\bclassName=/.test(tag) || /\b(?:sm:|md:|lg:)?(?:w|max-w)-\S/.test(tag)) offenders.push(name)
      }
    }
    expect(offenders).toEqual([])
    // The rule has something to hold: there are panels to look into.
    expect(total).toBeGreaterThan(20)
  })

  it("<dialog> を直に書くのは base.tsx だけ", async () => {
    const sources = [...await sourcesUnder("routes"), ...await sourcesUnder("components")]
    const writers = sources
      .filter(({ name, text }) => name !== "components/base.tsx" && /<dialog\b/.test(text))
      .map(({ name }) => name)
    expect(writers).toEqual([])
  })

  /**
   * The local names a file's messages reach a `title` / `note` / `warning`
   * through: bound straight to `messagesFor(…)`, derived from one already
   * bound (`const detail = messages.admin.detail`), or carried down as a prop
   * named for the slice it holds (`words: AssistantWords`).
   */
  function messageRootsIn(text: string): Set<string> {
    const roots = new Set(
      [...text.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*messagesFor\(/g)].map((m) => m[1] ?? ""),
    )
    for (const m of text.matchAll(/\b(\w+)\s*:\s*\w*Words\b/g)) roots.add(m[1] ?? "")
    let grew = roots.size > 0
    while (grew) {
      grew = false
      const derived = new RegExp(`\\b(?:const|let)\\s+(\\w+)\\s*=\\s*(?:${[...roots].join("|")})\\.`, "g")
      for (const m of text.matchAll(derived)) {
        const found = m[1] ?? ""
        if (!roots.has(found)) {
          roots.add(found)
          grew = true
        }
      }
    }
    return roots
  }

  it("title は空文字でも裸の識別子だけでもなく、messages の語を持つ", async () => {
    const offenders: string[] = []
    let total = 0
    for (const { name, text } of await dialogSources()) {
      const roots = [...messageRootsIn(text)]
      const rootPattern = roots.length > 0 ? new RegExp(`\\b(?:${roots.join("|")})\\b`) : null
      for (const { kind, tag } of openingTagsOf(text, ["Dialog", "Confirm"])) {
        const title = attrOf(tag, "title")
        if (title === undefined) continue
        total += 1
        if (title.form === "literal") {
          if (title.value.trim().length === 0) offenders.push(`${name} (${kind}): title が空`)
          continue
        }
        // A word from messages, however it is reached (`t.xTitle`, a call
        // wrapping a value, `t.deleteResearchTitle(view.humLabel ?? t.heading)`),
        // or a sentence written out as a literal (`dev-ui.tsx`'s catalogue).
        const namesAWord = (rootPattern?.test(title.value) ?? false) || /["'`][^"'`]+["'`]/.test(title.value)
        if (!namesAWord) offenders.push(`${name} (${kind}): title={${title.value}}`)
      }
    }
    expect(offenders).toEqual([])
    expect(total).toBeGreaterThan(20)
  })

  /**
   * Read at the call site rather than by the message key's name, so a
   * `note` / `warning` whose key happens not to end in "Warning" is held to
   * the same rule `app/i18n/messages.test.ts`'s「警告の文は句点で結ぶ」applies —
   * that file belongs to the words, not to this one, so the check for `Dialog`
   * の `note` lives here instead of being added there.
   */
  it("Dialog の note と Confirm の warning は句点で終わり「いま」で始まらない", async () => {
    function flatten(node: unknown, at: string): [string, string][] {
      if (typeof node === "function") return [[at, (node as (...args: unknown[]) => string)("x", "y", "z")]]
      if (typeof node === "string") return [[at, node]]
      if (node !== null && typeof node === "object") {
        return Object.entries(node).flatMap(([key, value]) => flatten(value, at === "" ? key : `${at}.${key}`))
      }
      return []
    }
    const all = flatten(messagesFor("ja"), "")

    const offenders: string[] = []
    let total = 0
    for (const { name, text } of await dialogSources()) {
      for (const { kind, tag } of openingTagsOf(text, ["Dialog", "Confirm"])) {
        const note = attrOf(tag, kind === "Dialog" ? "note" : "warning")
        if (note === undefined) continue
        total += 1

        let texts: string[]
        if (note.form === "literal") {
          texts = [note.value]
        } else {
          // Only the chain right after the root, not a leaf reached inside a
          // call's arguments (`t.deleteTitle(row.name)` names by `deleteTitle`,
          // not by the `name` its sentence happens to take).
          const chain = /^\s*\w+((?:\.\w+)*)/.exec(note.value)?.[1] ?? ""
          const leaf = chain.split(".").filter((segment) => segment !== "").pop()
          texts = leaf === undefined
            ? []
            : all.filter(([path]) => path === leaf || path.endsWith(`.${leaf}`)).map(([, text2]) => text2)
        }
        if (texts.length === 0) offenders.push(`${name} (${kind}): 語に解決できない — ${note.value}`)
        for (const one of texts) {
          if (!one.endsWith("。")) offenders.push(`${name} (${kind}): 句点で終わらない — ${one}`)
          if (one.startsWith("いま")) offenders.push(`${name} (${kind}): 「いま」で始まる — ${one}`)
        }
      }
    }
    expect(offenders).toEqual([])
    expect(total).toBeGreaterThan(15)
  })
})

/**
 * **The glyph on a pressable control names the kind of deed, not the screen**
 * (`docs/ui.md` の「押せるもの」の「印が言うのは操作の種類で、画面が選ぶものではない」)。
 * A word ending in one of the endings below is naming one of the kinds
 * `components/icons.tsx` の `ACTION_ICON` has a fixed glyph for, so the glyph
 * the control carries has exactly one right answer once the word is read.
 */
describe("押せるものの印", () => {
  // Longest ending first, so "非表示" is not read as "表示" with a prefix left over.
  const WORD_ACTION: Record<string, keyof typeof ACTION_ICON> = {
    非表示: "hide",
    作成: "create",
    追加: "create",
    保存: "save",
    削除: "delete",
    公開: "publish",
    取り込み: "takeIn",
    解除: "remove",
    解決: "resolve",
    戻す: "revert",
    表示: "show",
    検索: "search",
    外す: "remove",
  }
  const ENDINGS = Object.keys(WORD_ACTION).sort((a, b) => b.length - a.length)

  function actionFor(word: string): keyof typeof ACTION_ICON | undefined {
    const ending = ENDINGS.find((one) => word.endsWith(one))
    return ending === undefined ? undefined : WORD_ACTION[ending]
  }

  /**
   * Where a JSX opening tag ends: a nested `<Icon .../>` is one token deep
   * rather than a close, and `=>` inside an inline handler is not a close
   * either — both would otherwise read as the tag's own `>`.
   */
  function openingTag(text: string, start: number): { end: number, selfClosing: boolean, attrs: string } | null {
    let i = start + 1
    while (i < text.length && /[\w.]/.test(text[i] ?? "")) i++
    let depth = 0
    while (i < text.length) {
      if (text.startsWith("/>", i)) {
        if (depth === 0) return { end: i + 2, selfClosing: true, attrs: text.slice(start, i) }
        depth--
        i += 2
        continue
      }
      if (text[i] === "<") {
        depth++
        i++
        continue
      }
      if (text[i] === ">") {
        if (text[i - 1] === "=") {
          i++
          continue
        }
        if (depth === 0) return { end: i + 1, selfClosing: false, attrs: text.slice(start, i) }
        depth--
        i++
        continue
      }
      i++
    }
    return null
  }

  interface Usage { attrs: string, children: string | null }

  function findUsages(text: string, component: string): Usage[] {
    const found: Usage[] = []
    const re = new RegExp(`<${component}\\b`, "g")
    let match = re.exec(text)
    while (match !== null) {
      const tag = openingTag(text, match.index)
      if (tag === null) {
        match = re.exec(text)
        continue
      }
      let children: string | null = null
      if (!tag.selfClosing) {
        const close = text.indexOf(`</${component}>`, tag.end)
        if (close !== -1) children = text.slice(tag.end, close)
      }
      found.push({ attrs: tag.attrs, children })
      match = re.exec(text)
    }
    return found
  }

  interface Assign { name: string, path: string, index: number }

  /**
   * Every `const t = messagesFor(locale).admin.a.b`, and every `const u = t.c`
   * chained off one already seen — `t` is not always assigned straight from
   * `messagesFor`, some screens go through a `messages` variable first.
   */
  function findAssignments(text: string): Assign[] {
    const found: Assign[] = []
    const latest: Record<string, string> = {}
    const re = /\b(?:const|let)\s+(\w+)\s*=\s*(messagesFor\([^)]*\)|\w+)((?:\.\w+)*)/g
    let match = re.exec(text)
    while (match !== null) {
      const name = match[1] ?? ""
      const base = match[2] ?? ""
      const chain = (match[3] ?? "").replace(/^\./, "")
      let assigned: string | undefined
      if (base.startsWith("messagesFor(")) assigned = chain
      else if (base in latest) assigned = [latest[base], chain].filter((one) => one !== "").join(".")
      if (assigned !== undefined) {
        found.push({ name, path: assigned, index: match.index })
        latest[name] = assigned
      }
      match = re.exec(text)
    }
    return found
  }

  /** The nearest assignment of `name` before `atIndex`, plus whatever path followed it. */
  function resolvePath(assigns: Assign[], expr: string, atIndex: number): string | undefined {
    const trimmed = expr.trim()
    const direct = /^messagesFor\([^)]*\)((?:\.\w+)*)$/.exec(trimmed)
    if (direct !== null) return (direct[1] ?? "").replace(/^\./, "")
    const idMatch = /^(\w+)((?:\.\w+)*)$/.exec(trimmed)
    if (idMatch === null) return undefined
    const [, name, rest] = idMatch
    const candidates = assigns.filter((a) => a.name === name && a.index < atIndex)
    if (candidates.length === 0) return undefined
    const best = candidates.reduce((a, b) => (b.index > a.index ? b : a))
    return [best.path, (rest ?? "").replace(/^\./, "")].filter((one) => one !== "").join(".")
  }

  function getAt(obj: unknown, dotted: string): unknown {
    if (dotted === "") return obj
    return dotted.split(".").reduce<unknown>((acc, key) => {
      if (acc === null || typeof acc !== "object") return undefined
      return (acc as Record<string, unknown>)[key]
    }, obj)
  }

  type AttrFound = { literal: string } | { expr: string } | undefined

  function attrValue(attrs: string, prop: string): AttrFound {
    const m = new RegExp(`\\b${prop}=(?:"([^"]*)"|\\{([^}]*)\\})`).exec(attrs)
    if (m === null) return undefined
    return m[1] !== undefined ? { literal: m[1] } : { expr: m[2] ?? "" }
  }

  /** The `IconName` an icon-carrying prop resolves to, or `undefined` for one this cannot read. */
  function iconAt(attrs: string, prop: string, fallback?: string): string | undefined {
    const found = attrValue(attrs, prop)
    if (found === undefined) return fallback
    if ("literal" in found) return found.literal
    const nested = /<Icon\s+name="([\w-]+)"/.exec(found.expr)
    if (nested !== null) return nested[1]
    // A way's mark is drawn by `Chevron` (`base.tsx`), which names its direction rather than the glyph.
    const way = /<Chevron\s+dir="(left|right)"/.exec(found.expr)
    return way === null ? undefined : `chevron-${way[1]}`
  }

  function wordAt(attrs: string, prop: string, assigns: Assign[], atIndex: number, ja: unknown): string | undefined {
    const found = attrValue(attrs, prop)
    if (found === undefined) return undefined
    if ("literal" in found) return found.literal
    const msgPath = resolvePath(assigns, found.expr, atIndex)
    const value = msgPath === undefined ? undefined : getAt(ja, msgPath)
    return typeof value === "string" ? value : undefined
  }

  /** A control's own word is its children — plain text, or a single `{t.x}` expression. */
  function wordInChildren(children: string | null, assigns: Assign[], atIndex: number, ja: unknown): string | undefined {
    const text = children?.trim()
    if (text === undefined || text === "") return undefined
    const braced = /^\{([^{}]*)\}$/.exec(text)
    if (braced !== null) {
      const msgPath = resolvePath(assigns, braced[1] ?? "", atIndex)
      const value = msgPath === undefined ? undefined : getAt(ja, msgPath)
      return typeof value === "string" ? value : undefined
    }
    // Anything else — a ternary, a nested tag, a function call — is a word this cannot read.
    return /[{}<>]/.test(text) ? undefined : text
  }

  const PRESSABLE = ["Submit", "Button", "ButtonLink", "Confirm", "Dialog", "IconButton"] as const

  it("語の結びが決める操作の印と、渡している印が一致する", async () => {
    const ja = messagesFor("ja")
    const offenders: string[] = []
    let matched = 0

    for (const name of await managementFiles()) {
      const text = await readFile(path.join(ROOT, name), "utf8")
      const assigns = findAssignments(text)
      for (const component of PRESSABLE) {
        for (const usage of findUsages(text, component)) {
          const atIndex = text.indexOf(usage.attrs)
          const word = component === "Confirm"
            ? wordAt(usage.attrs, "confirm", assigns, atIndex, ja)
            : component === "IconButton" || component === "Dialog"
              ? wordAt(usage.attrs, "label", assigns, atIndex, ja)
              : wordInChildren(usage.children, assigns, atIndex, ja)
          if (word === undefined) continue // resolved from something dynamic — not counted
          const action = actionFor(word)
          if (action === undefined) continue // not one of the rule's endings

          const icon = component === "Confirm"
            ? iconAt(usage.attrs, "icon", "trash")
            : component === "IconButton"
              ? iconAt(usage.attrs, "name")
              : iconAt(usage.attrs, "icon")
          if (icon === undefined) continue // the icon itself is dynamic — not counted

          matched += 1
          const expected: string = ACTION_ICON[action]
          if (icon !== expected) offenders.push(`${name} [${component}] "${word}": ${icon} (${expected} を待つ)`)
        }
      }
    }

    expect(offenders).toEqual([])
    // The rule has something to hold: this many admin controls carry a rule-covered word.
    expect(matched).toBeGreaterThan(20)
  })
})

/**
 * A way's mark moves the way it points (`base.tsx` の `Chevron`, `docs/ui.md` の
 * 「押せるもの」). A screen drawing the glyph itself would draw one that stands
 * still beside ones that move, and the motion would stop saying anything.
 */
describe("向きのある印", () => {
  it("chevron-left / chevron-right を Icon で直に描くのは base.tsx だけ — 他は Chevron", async () => {
    const files = [...(await sourcesUnder("routes")), ...(await sourcesUnder("components"))]
      .filter(({ name }) => !name.endsWith("base.tsx") && !name.endsWith("icons.tsx"))
    const offenders = files
      .filter(({ text }) => /<Icon\s+name="chevron-(?:left|right)"/.test(text))
      .map(({ name }) => name)
    expect(offenders).toEqual([])
  })
})

describe("メニューの 1 行", () => {
  /**
   * **`MENU_ITEM` is a line inside an opened panel and nothing else** (`docs/ui.md`
   * の「押せるもの」). Drawn anywhere else it is a bare word that grows a box
   * on hover — a control the reader finds by pressing it. The panels are the
   * two parts that open one, `Menu` and `Chooser`, and the `<details>` a part
   * draws its own panel with (`form.tsx` の `Select`).
   */
  const OPENS = /<(Menu|Chooser|details)\b/g
  const CLOSES = /<\/(Menu|Chooser|details)>/g

  /** Whether the position is inside a panel: the nearest panel tag before it opens rather than closes. */
  function insidePanel(text: string, at: number): boolean {
    const before = text.slice(0, at)
    const lastOpen = Math.max(-1, ...[...before.matchAll(OPENS)].map((one) => one.index))
    const lastClose = Math.max(-1, ...[...before.matchAll(CLOSES)].map((one) => one.index))
    return lastOpen > lastClose
  }

  it("メニューの外で MENU_ITEM を着ない", async () => {
    const outside: string[] = []
    for (const { name, text } of await everySource()) {
      if (name === "components/base.tsx") continue
      for (const use of text.matchAll(/\bMENU_ITEM(?:_HERE)?\b/g)) {
        const line = text.slice(0, use.index).split("\n").length
        // The import, the destructured name and a line handing the class to a
        // variable are not a use: what is drawn is where the variable is put.
        const row = text.split("\n")[line - 1] ?? ""
        if (/^\s*(import\b|const\b|MENU_ITEM(?:_HERE)?,?\s*$)/.test(row) || /\bfrom\s+"/.test(row)) continue
        if (!insidePanel(text, use.index)) outside.push(`${name}:${String(line)}`)
      }
    }
    expect(outside).toEqual([])
  })
})

describe("送信中の印", () => {
  /**
   * **A control that sent a deed waits in place, and the parts draw that**
   * (`docs/ui.md` の「壊れるもの」): the spinner turns in the icon's box of the
   * pressed `Submit` or `Confirm`, and a screen that drew one of its own would
   * be a second way of saying the same thing — or a way of saying it in a
   * place that moves.
   */
  it("spinner を描くのは Submit と Confirm だけで、画面は描かない", async () => {
    const sources = [...await sourcesUnder("routes"), ...await sourcesUnder("components")]
    const drawn = sources
      .filter(({ name }) => !["components/base.tsx", "components/form.tsx", "components/icons.tsx"].includes(name))
      .filter(({ text }) => /<Spinner\b|name="spinner"/.test(text))
      .map(({ name }) => name)
    expect(drawn).toEqual([])
    // The rule has something to hold: the two parts do draw it.
    const parts = sources.filter(({ name }) => ["components/base.tsx", "components/form.tsx"].includes(name))
    expect(parts.every(({ text }) => /<Spinner\b/.test(text))).toBe(true)
  })

  /**
   * The spinner stands in the icon's box, so a submit without an icon would
   * grow by one box at the moment it is pressed — and everything beside it
   * would move.
   */
  it("Submit はアイコンを持つ — spinner が立つ箱がそこにしか無い", async () => {
    const sources = [...await sourcesUnder("routes"), ...await sourcesUnder("components")]
    const bare: string[] = []
    for (const { name, text } of sources) {
      const opening = /<Submit\b[^>]*>/g
      let match = opening.exec(text)
      while (match !== null) {
        if (!match[0].includes("icon=")) bare.push(`${name}: ${match[0].split("\n")[0] ?? ""}`)
        match = opening.exec(text)
      }
    }
    expect(bare).toEqual([])
  })

  /**
   * A listing narrowed by its pane goes quiet for as long as the loader takes;
   * `useBusyHere` says so after 200ms on the public side, and a management
   * listing that pinned `busy` to false said nothing however long it took.
   */
  it("一覧の busy を false に固定しない — useBusyHere が言う", async () => {
    const screens = await sourcesUnder("routes")
    const pinned = screens.filter(({ text }) => text.includes("busy={false}")).map(({ name }) => name)
    expect(pinned).toEqual([])
    const listings = screens.filter(({ text }) => /<RefinableList\b/.test(text))
    expect(listings.length).toBeGreaterThan(5)
    expect(listings.every(({ text }) => text.includes("useBusyHere()"))).toBe(true)
  })
})

/**
 * **A draft's five screens read from the same three-section shape**
 * (`docs/admin-ui.md` の「編集画面」) rather than from a strip of steps: the
 * head names the screen and — for the research editor only — this draft's
 * other faces as facts, and the tools row is the one thing that stays while
 * typing.
 */
describe("下書きの頭の区画と道具の行", () => {
  /** The five screens' own files — not `draft-tools.tsx` or `admin.tsx`, which draw the shape the five stand in. */
  async function draftScreenSources(): Promise<{ name: string, text: string }[]> {
    const routes = (await sourcesUnder("routes")).filter(({ name }) => name.startsWith("routes/admin-draft"))
    const parts = ["components/dataset-editor.tsx", "components/editor.tsx", "components/publish.tsx", "components/review.tsx"]
    const components = await Promise.all(parts.map(async (name) => ({
      name, text: await readFile(path.join(ROOT, name), "utf8"),
    })))
    return [...routes, ...components]
  }

  it("下書きの 5 画面のどこにも段の列 (DraftSteps) は無い", async () => {
    const drawn = (await draftScreenSources())
      .filter(({ text }) => /<DraftSteps\b/.test(text))
      .map(({ name }) => name)
    expect(drawn).toEqual([])
  })

  it("道具の行 (DraftTools) を描くのは editor と dataset-editor の 2 つで、sticky は頭の区画 (DraftHead) だけが持つ", async () => {
    const sources = await draftScreenSources()
    const drawsTools = sources.filter(({ text }) => /<DraftTools\b/.test(text)).map(({ name }) => name).sort()
    expect(drawsTools).toEqual(["components/dataset-editor.tsx", "components/editor.tsx"])
    // Five画面 own files never write `sticky` themselves — it is `DraftHead`'s alone (`draft-tools.tsx`),
    // the card that folds to the tools row and stays.
    const stickyHere = sources.filter(({ text }) => /\bsticky\b/.test(text)).map(({ name }) => name)
    expect(stickyHere).toEqual([])
    const tools = await readFile(path.join(ROOT, "components/draft-tools.tsx"), "utf8")
    const head = tools.slice(tools.indexOf("export function DraftHead"), tools.indexOf("export function DraftTools"))
    expect(head.match(/\bsticky\b/g)).toHaveLength(1)
    expect(tools.match(/\bsticky\b/g)).toHaveLength(1)
  })

  it("頭の区画の 2 行目の道は WayTo (枠の面 + 語の後ろの chevron) で、番号を持たない", async () => {
    const text = await readFile(path.join(ROOT, "components/editor.tsx"), "utf8")
    const start = text.indexOf("function DraftOverview")
    expect(start).toBeGreaterThan(-1)
    const end = text.indexOf("\nfunction ", start + 1)
    const body = text.slice(start, end === -1 ? undefined : end)
    expect([...body.matchAll(/<WayTo\b/g)]).toHaveLength(4)
    // The transition mark is `WayTo`'s own; the row draws neither a chevron nor a step number itself.
    expect(body).not.toContain("chevron-right")
    expect(body).not.toMatch(/>\s*\{at \+ 1\}\s*</)
  })

  it("記事とお知らせは道具の行 (ArticleTools) を頭の区画に渡し、sticky は自分でも contents.tsx でも書かない", async () => {
    const routeNames = ["routes/admin-contents-document.tsx", "routes/admin-contents-news-item.tsx"]
    const routes = await Promise.all(routeNames.map(async (name) => ({
      name, text: await readFile(path.join(ROOT, name), "utf8"),
    })))
    const handsTools = routes.filter(({ text }) => text.includes("tools={panes.tools}")).map(({ name }) => name)
    expect(handsTools).toEqual(routeNames)
    // The head (`DraftHead`) is what sticks; neither screen nor `ArticleTools` writes `sticky`.
    const stickyHere = routes.filter(({ text }) => /\bsticky\b/.test(text)).map(({ name }) => name)
    expect(stickyHere).toEqual([])

    const contents = await readFile(path.join(ROOT, "components/contents.tsx"), "utf8")
    expect(contents.match(/\bsticky\b/g)?.length ?? 0).toBe(0)
  })
})
