/**
 * The rules about spacing and shape that a reader would notice being broken.
 *
 * `app.contrast.test.ts` is the same idea for colour: a requirement nobody can
 * check by looking at one screen, held by something that reads the source. What
 * is here is the pair of rules that kept slipping — the screens each having
 * their own margins, and the same box being drawn with a different corner in
 * every file.
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
  "components/research-fields.tsx",
  "components/import.tsx",
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
  it("公開画面が margin を書かず、間隔は Stack が管理する", async () => {
    const offenders: string[] = []
    for (const screen of PUBLIC_SCREENS) {
      const text = await readFile(path.join(ROOT, "routes", `${screen}.tsx`), "utf8")
      const hits = marginsIn(text)
      if (hits.length > 0) offenders.push(`${screen}.tsx: ${hits.join(" ")}`)
    }
    expect(offenders).toEqual([])
  })

  it("管理画面も margin を書かず、間隔は Stack が管理する", async () => {
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
   * 2 通りになり、複数の画面を行き来する人には理由の無い差として残る。
   *
   * **h1 の下に節の名前が無い画面だけが `normal`。** 絞り込み pane がある
   * 一覧がそれで、下に来るのは節ではなく pane の見出し — 見出しが 2 つ続く形に
   * 節と節の距離を空けると h1 だけが離れて見える。公開側の一覧も同じ理由で `normal` で、
   * 両者は同じ形の 2 つの部分になる。**`common/` のファイル一覧も同じ**
   * (`routes/admin-files.tsx`)。節を 1 つも持たない画面で、h1 の下に
   * 来るのはアップロード欄そのもの — アップロード欄には自前の余白があるので、32px を空けると
   * 字から字までは 48px になる。**アラートの画面も節を持たない**
   * (`routes/admin-alert.tsx`)。h1 の下に来るのは 1 件目のアラートで、
   * それが開くのは名前ではなく自分の状態のチップ。
   *
   * **編集画面の上部の欄は `Card` ではなく自前の要素** (`components/draft-tools.tsx` の
   * `DraftHead`) で、この規則の外にある — sticky で留まるとツールバー 1 行にまとまる欄で、行の
   * あいだは `Stack` の既定。**記事とお知らせの編集画面の上部の欄は `normal`**
   * (`useArticlePanes` を呼ぶ画面) — 見出しの行とツールバーのあいだに、名前の付いた節
   * (バージョン管理・公開日時) が表示される。h1 の 8px 下に節の名前が乗ると h1 の 2 行目に
   * 読め、32px 空けると HeaderBar が節を囲むカードのように見える。
   */
  it("管理画面のカードは block で始まる — 絞り込む一覧と編集画面のバーだけが違う", async () => {
    const offenders: string[] = []
    for (const file of await managementFiles()) {
      const text = await readFile(path.join(ROOT, file), "utf8")
      const sectionless = file.endsWith("admin-alert.tsx")
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
 * The corners a box may have. `rounded` and `rounded-full` are
 * the two anything may take; `rounded-lg` belongs to what a 4px corner
 * disappears on — the call-to-action buttons on the front page, and the listing tabs, which
 * have no edge and sit against a surface barely lighter than their own — so it is
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
   * The inner outline of a box that has a line is rounded by the radius
   * less the width of the line: 3px inside a 4px box drawn with 1px. A header bar
   * given the same `rounded-t` is a pixel rounder than the corner it sits in,
   * and the background shows through the crescent between them. The box clips it
   * instead, which is the one radius that cannot disagree with itself.
   */
  it("枠線のある要素に敷いた HeaderBar は、外側の要素で角を切る", async () => {
    const nested = /className="([^"]*\bborder\b[^"]*)"\s*>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<HeaderBar\b([^>]*)>/g
    const sources = [...await sourcesUnder("components"), ...await sourcesUnder("routes")]
    const found: string[] = []
    const offenders: string[] = []
    for (const { name, text } of sources) {
      let match = nested.exec(text)
      while (match !== null) {
        const box = match[1] ?? ""
        const attributes = match[2] ?? ""
        found.push(`${name}: ${box}`)
        if (!box.split(/\s+/).includes("overflow-hidden")) offenders.push(`${name}: ${box}`)
        if (/\brounded/.test(attributes)) offenders.push(`${name}: <HeaderBar${attributes}>`)
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
 * corner shown beside the rounded one — with a wedge of the page showing
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
 * has the shadow, so the only way to notice is to measure the colour of the
 * pixels that should have been shaded.
 */
/**
 * A column's floor belongs to `Td`'s own prop, not to the class list beside it.
 * Two `min-w-*` rules of equal weight are settled by whichever Tailwind emitted
 * last, so writing one in `className` beside the default made widening a column
 * appear to work and narrowing one do nothing at all.
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
 * kept in sync with a second one above the fold — all of it is defined in `Table` /
 * `Td`, and a screen that writes its own `<table>` gets none of it and responds
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
 * reach became 34.4, with nothing on the screen to report it.
 */
describe("溶接された操作の押せる範囲", () => {
  it("Chooser の高さから引き算せず、36px と決める", async () => {
    const parts = await readFile(path.join(ROOT, "components/base.tsx"), "utf8")
    const side = /export const CHOOSER_SIDE\s*=\s*"([^"]*)"/.exec(parts)?.[1]
    expect(side).toBeDefined()
    expect(side).toContain("after:h-tap")
    expect(side).not.toMatch(/after:-?inset-y-/)
  })
})

/**
 * The bar at the top is one part in two states — a public page draws the
 * navigation, a management screen does not — so what is shown in its row has to
 * be one height. The pills, the cart and the account are 36px; a destination
 * left on its own line box came to 38.4 and made the header 2.4px taller
 * wherever the navigation was drawn, with the wordmark, its name and the
 * controls 1.2px with it. **Two and a half pixels are not
 * something looking at it finds**, which is why the height is read out of the
 * source instead.
 */
describe("ヘッダの行の高さ", () => {
  it("バーの行き先が、隣に並ぶものと同じ 36px で揃う", async () => {
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
 * heading, so a reader moving between them meets one h2 rather than two.
 * **The size and the indicator are what they share; the colour is
 * not.** The pair is written in two files — one a component, one a
 * stylesheet — which is the only reason it can drift.
 */
describe("見出しの階層", () => {
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
   * the indicator reports "heading" instead — which also means every rung holds the
   * same weight, since weight is then the only thing separating a heading from
   * the paragraph under it.
   */
  it("記事の見出しに色を付けず、weight も階層で変えない", async () => {
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
  it("斜辺の幅が、せん断が動かす分より広い", async () => {
    const { width, shear } = await slope()
    expect(width).toBeGreaterThan(shear)
  })

  /**
   * An arc begins a radius away from the corner it rounds, so the strip has to
   * are shown at least that far clear of the box before the corner can be the thing
   * that draws the silhouette. Short of it, the first pixels down from the top
   * are the box's own square edge — a nub beside the curve.
   */
  it("斜辺の張り出しが、その角丸より大きい", async () => {
    const { width, shear, radius } = await slope()
    expect(width - shear).toBeGreaterThan(radius)
  })
})

/**
 * **件数とページ送りは 1 つのまとまり。** どちらも「いま何ページ目の何件を見ているか」を表すので、
 * 同じ場所にまとめる。**それを守らせる方法は「近くに書く」ではなく
 * 「1 か所でしか書けないようにする」** — 各画面が件数を書けると、画面ごとに出し方がずれ、
 * 出し忘れる画面も出る。
 */
describe("一覧の件数とページ送り", () => {
  it("件数を出すのは Paging だけ", async () => {
    const sources = [...await sourcesUnder("components"), ...await sourcesUnder("routes")]
    const writers = sources
      .filter(({ text }) => /messages\.search\.(range|results)\b/.test(text))
      .map(({ name }) => name)
      .sort()
    // カートだけは別: ページに切られないので、表示する数は範囲ではなく総数そのもの。
    expect(writers).toEqual(["components/page.tsx", "routes/cart.tsx"])
  })

  it("その Paging の中で、件数とページ送りが同じ場所にまとまる", async () => {
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
    expect(writers).toEqual(["components/page.tsx"])
  })

  // 並び替えの向きと 1 ページの件数を画面ごとに組むと、既定の向きをアドレスに書く・絞り込みの form が
  // 並び順を引き継がない、の 2 つが 1 画面ずつずれていく (`search.tsx` の `ListingTools` / `ListingPresented`)。
  it("並び替えと 1 ページの件数を組むのは search.tsx だけ", async () => {
    const sources = [...await sourcesUnder("components"), ...await sourcesUnder("routes")]
    const building = sources
      .filter(({ name, text }) => name !== "components/base.tsx"
        && (/\bCHOOSER_SIDE\b/.test(text) || /PAGE_SIZES\.map\b/.test(text)))
      .map(({ name }) => name)
    expect(building).toEqual(["components/search.tsx"])
  })

  it("管理画面の絞り込みの form が並び順と件数を引き継ぐのは ListingPresented だけ", async () => {
    const files = [...await managementFiles(), "components/search.tsx"]
    const carrying: string[] = []
    for (const file of files) {
      const text = await readFile(path.join(ROOT, file), "utf8")
      if (/type="hidden" name="(sort|order|size)"/.test(text)) carrying.push(file)
    }
    expect(carrying).toEqual(["components/search.tsx"])
  })
})

/**
 * **開閉するパネルが閉じる 3 通り (Escape・外を押す・遷移) は `base.tsx` の `useDismissible` だけが管理する**。
 * パネルごとに書くと、どれか 1 つだけが閉じ方を
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

/** The three numbers the slope is made of, read from where each one is kept. */
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

describe("ボタンの色と形", () => {
  /**
   * The round end is where a control is placed, not how it should look — the header bar
   * of controls above a listing, and nowhere else (`base.tsx` の `ButtonLook`).
   * Asked for as a taste it had spread to five places that are not a listing,
   * and the shape had stopped indicating anything.
   */
  it("丸いのは一覧の操作列にいるものだけ", async () => {
    const styled = (await everySource())
      // A part handing its caller's choice on (`listing={listing}`) is not a place.
      .filter(({ text }) => /<(?:Button|ButtonLink|CopyButton)\b[^>]*\slisting\b(?!=\{listing\})/s.test(text))
      .map(({ name }) => name)
      .sort()
    expect(styled).toEqual(["components/search.tsx"])
  })

  /**
   * **The filled style is the one thing a screen is requesting**, so a file that
   * draws two of them has stopped ranking anything. Counted per file rather than
   * per screen because a part is drawn inside whichever screen imports it; the
   * catalogue is exempt, being a page of samples rather than a screen with an
   * errand.
   *
   * **A style chosen in an expression counts the same as one written out.** Read
   * for the literal alone, a switch handing `primary` to whichever option is
   * current passed as a single filled button and drew one per field.
   *
   * **`accent` is a fill and is not counted here**, because it is not the
   * screen ranking anything: it is shown by a save that is holding something
   * unsent, so how many appear is decided by what has been typed. A screen with
   * four things to edit can be waiting on all four.
   */
  it("塗りのボタンは 1 つのファイルに 1 つまで", async () => {
    const filled = /variant=(?:"primary"|\{[^}]*"primary"[^}]*\})/g
    const twice = (await everySource())
      .map(({ name, text }) => ({ name, n: (text.match(filled) ?? []).length }))
      .filter(({ n }) => n > 1)
    expect(twice).toEqual([])
  })

  /**
   * **What is chosen is not what should be pressed.** A state shown in a style
   * spends the ranking the styles exist to express, so the control that holds one
   * is `Choice`, whose options divide a box rather than being shown as buttons of
   * their own.
   */
  it("選んだ状態を Button の色で表さない", async () => {
    const styled = (await everySource())
      .filter(({ text }) => /<Button(?:Link)?\b[^>]*\saria-pressed\b/s.test(text))
      .map(({ name }) => name)
    expect(styled).toEqual([])
  })

  /** The palette itself, so that a style nobody uses cannot quietly come back. */
  it("色は 4 つしかない", async () => {
    const parts = await readFile(path.join(ROOT, "components/base.tsx"), "utf8")
    const union = /export type ButtonVariant = ([^\n]*)/.exec(parts)?.[1]
    expect(union?.match(/"[a-z]+"/g))
      .toEqual(["\"primary\"", "\"accent\"", "\"secondary\"", "\"danger\""])
  })
})

describe("見出しの行の並び", () => {
  /**
   * The kinds of thing that are shown to the right of a screen's name, in the one
   * order they keep: the cancel button, the
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

  it("ダイアログの中に画面が文とボタンの行を描かない — どちらも Dialog が描く", async () => {
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

  it("値が無いセルを横棒で描かない — 語で表示するか、空にするかの 2 つ", async () => {
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

  it("slug を入力し直すダイアログは 1 つの部品で、画面が自分では描かない", async () => {
    const screens = await sourcesUnder("routes")
    // A screen that reaches for the panel's words is drawing the panel itself.
    const drawnByHand = screens
      .filter(({ text }) => /\bt\.(rename|renameTitle|renameWarning|renameConfirm)\b/.test(text))
      .map(({ name }) => name)
    expect(drawnByHand).toEqual([])
    const users = screens.filter(({ text }) => /<SlugEditor\b/.test(text)).map(({ name }) => name).sort()
    // The research box changes names on the same panel, from `components/files.tsx`.
    expect(users).toEqual(["routes/admin-document.tsx", "routes/admin-files.tsx"])
  })

  it("出る経路、他所への経路、この画面への操作、取り消せない操作の順に並ぶ", async () => {
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
   * `Heading`'s children. Neither is a
   * `nameRows` row — the header's own `Heading` is self-closing, and the tools
   * row is not a `Heading` at all — so both are checked here by where each
   * part sits in `draft-tools.tsx`'s own markup.
   */
  it("DraftHead の行に出る経路は 1 本だけある — 事実は 2 行目、見出しの行には無い", async () => {
    const text = await readFile(path.join(ROOT, "components/draft-tools.tsx"), "utf8")
    const start = text.indexOf("export function DraftHead")
    expect(start).toBeGreaterThan(-1)
    const end = text.indexOf("export function DraftTools", start)
    const body = text.slice(start, end)
    expect([...body.matchAll(/<AdminBack\b/g)]).toHaveLength(1)
  })

  /**
   * Under the table of versions and drafts, the one thing to press is shown at
   * the left edge — where the rows begin, and where every other section of
   * the research's screen puts what it offers. Pushed to the right end it sits
   * under the row's buttons and reads as one more of them.
   */
  it("研究の編集の「空の下書きの作成」は表の下の左端に置かれる", async () => {
    const text = await readFile(path.join(ROOT, "routes/admin-research.tsx"), "utf8")
    const submit = text.indexOf("intent=\"create-draft\"")
    expect(submit).toBeGreaterThan(-1)
    const form = text.lastIndexOf("<Form", submit)
    const tag = text.slice(form, text.indexOf(">", form))
    expect(tag).not.toMatch(/\bjustify-(end|between|center)\b|\bml-auto\b/)
  })

  /**
   * Every row that has a draft — a draft's own, and a version being updated
   * in one — offers the draft's screens in the order the work goes: write it,
   * show it, publish it; what throws something away comes last. The review
   * is offered even though the review cell has nothing to press: it reports only
   * whether the draft is shared.
   */
  describe("研究の編集の行の操作", () => {
    const source = async (): Promise<string> =>
      readFile(path.join(ROOT, "routes/admin-research.tsx"), "utf8")
    const bodyOf = (text: string, name: string): string => {
      const start = text.indexOf(`function ${name}`)
      expect(start).toBeGreaterThan(-1)
      return text.slice(start, text.indexOf("\n}\n", start))
    }
    const inOrder = (text: string, needles: readonly string[]): void => {
      const at = needles.map((needle) => text.indexOf(needle))
      expect(at.every((one) => one > -1)).toBe(true)
      expect(at).toEqual([...at].sort((a, b) => a - b))
    }

    it("レビュー・公開の順で下書きの画面へ移動する", async () => {
      inOrder(bodyOf(await source(), "DraftLinks"), ["adminDraftReviewPath(", "adminDraftPublishPath("])
    })

    it("下書きの行は 編集・レビューと公開・削除", async () => {
      const row = bodyOf(await source(), "DraftRow")
      inOrder(row.slice(row.indexOf("holds=\"control\"")), ["adminDraftPath(", "<DraftLinks", "intent=\"discard-draft\""])
    })

    it("更新中のバージョンの行も 編集のすぐ後にレビューと公開がある", async () => {
      const row = bodyOf(await source(), "VersionRow")
      inOrder(row.slice(row.indexOf("holds=\"control\"")), [
        "adminDraftPath(",
        "<DraftLinks",
        "intent=\"copy-version\"",
        "intent=\"discard-draft\"",
        "intent=\"withdraw-version\"",
      ])
    })

    it("表に不備の列は無く、行の数を chip で表示しない", async () => {
      const text = await source()
      expect(text).not.toContain("t.problems")
      expect(text).not.toMatch(/<Flag kind="(unresolved|stops|short)"/)
    })

    /**
     * The count is the only way from this table to a row's datasets, so it
     * is styled as a link to another screen at the row's size — a bare
     * number in the link colour reads as one more fact of the row.
     */
    it("データセットの件数は行の大きさの ScreenLink で、素の link にしない", async () => {
      const body = bodyOf(await source(), "Datasets")
      expect(body).toMatch(/<ScreenLink\b[^>]*\bsize="row"/)
      expect(body).not.toMatch(/<Link\b/)
    })
  })

  it("DraftTools の行は、保存・その状態・パネルを開くボタン・切り替えの順に並ぶ", async () => {
    const text = await readFile(path.join(ROOT, "components/draft-tools.tsx"), "utf8")
    const start = text.indexOf("export function DraftTools")
    expect(start).toBeGreaterThan(-1)
    const body = text.slice(start)
    const save = body.indexOf("variant=\"accent\"")
    const status = body.indexOf("<SaveNews")
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
 * one. What follows reads the source for the
 * ways a screen could still take that back: choosing its own width, writing
 * `<dialog>` by hand, naming the panel after a bare value instead of a word,
 * or a sentence that does not close the way one does.
 */
describe("ダイアログの幅・文・見出し", () => {
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
   * object and an act on it —
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
   * bound (`const detail = messages.admin.detail`), or passed down as a prop
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

  it("title は空文字でも裸の識別子だけでもなく、messages の語を使う", async () => {
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
        // or a sentence written out as a literal.
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
   * の `note` is kept here instead of being added there.
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

/* ------------------------------------------------ reading JSX for the rules below */

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

/** The `IconName` an icon-valued prop resolves to, or `undefined` for one this cannot read. */
function iconAt(attrs: string, prop: string, fallback?: string): string | undefined {
  const found = attrValue(attrs, prop)
  if (found === undefined) return fallback
  if ("literal" in found) return found.literal
  const nested = /<Icon\s+name="([\w-]+)"/.exec(found.expr)
  if (nested !== null) return nested[1]
  // A link's chevron is drawn by `Chevron` (`base.tsx`), which identifies its direction rather than the glyph.
  const direction = /<Chevron\s+dir="(left|right)"/.exec(found.expr)
  return direction === null ? undefined : `chevron-${direction[1]}`
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

/**
 * **The glyph on a pressable control names the kind of action, not the screen**.
 * A word ending in one of the endings below is naming one of the kinds
 * `components/icons.tsx` の `ACTION_ICON` has a fixed glyph for, so the glyph
 * the control shows has exactly one right answer once the word is read.
 */
describe("押せるもののアイコン", () => {
  // Longest ending first, so "非表示" is not read as "表示" with a prefix left over.
  const WORD_ACTION: Record<string, keyof typeof ACTION_ICON> = {
    "非表示": "hide",
    "作成": "create",
    "追加": "create",
    "発行": "create",
    "保存": "save",
    "削除": "delete",
    // Stopping an update throws its draft away; the version is not touched.
    "更新の中止": "delete",
    "公開": "publish",
    "上書き": "publish",
    "公開停止": "withdraw",
    "取り下げ": "withdraw",
    "取り込み": "importData",
    // A file brought down to the reader's machine comes the same way a value is imported.
    "ダウンロード": "importData",
    "割り当て": "assign",
    "張り替え": "assign",
    "primary に変更": "assign",
    "解除": "remove",
    "解決": "resolve",
    "戻す": "revert",
    "表示": "show",
    "共有": "show",
    "共有停止": "hide",
    "検索": "search",
    "外す": "remove",
    "統合": "merge",
    "再発行": "redo",
    "再解析": "redo",
    "編集": "edit",
    "コピー": "copy",
    "複製": "copy",
    "切り出し": "copy",
    "その行へ": "goTo",
    "上へ": "reorderUp",
    "下へ": "reorderDown",
    "ファイルの選択": "chooseFile",
  }
  const ENDINGS = Object.keys(WORD_ACTION).sort((a, b) => b.length - a.length)

  function actionFor(word: string): keyof typeof ACTION_ICON | undefined {
    const ending = ENDINGS.find((one) => word.endsWith(one))
    return ending === undefined ? undefined : WORD_ACTION[ending]
  }

  const PRESSABLE = ["Submit", "Button", "ButtonLink", "Confirm", "Dialog", "IconButton"] as const

  interface Pressed { file: string, component: string, word: string | undefined, icon: string | undefined, iconless: boolean }

  /**
   * Every pressable the given files draw, with its word and glyph where they
   * can be read. **A glyph drawn by the part itself counts as the part's** —
   * `Confirm` has `trash` unless told otherwise, `ButtonLink newTab` draws
   * `external`, and a way (`way`, `ScreenLink`) ends in a chevron.
   */
  async function pressables(files: readonly string[]): Promise<Pressed[]> {
    const ja = messagesFor("ja")
    const found: Pressed[] = []
    for (const name of files) {
      const text = await readFile(path.join(ROOT, name), "utf8")
      const assigns = findAssignments(text)
      for (const component of [...PRESSABLE, "ScreenLink"] as const) {
        for (const usage of findUsages(text, component)) {
          // A panel drawn open by its caller (`held`) has no trigger to press.
          if ((component === "Dialog" || component === "Confirm") && /\bheld=/.test(usage.attrs)) continue
          const atIndex = text.indexOf(usage.attrs)
          const word = component === "Confirm"
            ? wordAt(usage.attrs, "confirm", assigns, atIndex, ja)
            : component === "IconButton" || component === "Dialog"
              ? wordAt(usage.attrs, "label", assigns, atIndex, ja)
              : wordInChildren(usage.children, assigns, atIndex, ja)
          const icon = component === "Confirm"
            ? iconAt(usage.attrs, "icon", "trash")
            : component === "IconButton"
              ? iconAt(usage.attrs, "name")
              : component === "ButtonLink" && /\bnewTab\b/.test(usage.attrs)
                ? "external"
                : iconAt(usage.attrs, "icon")
          const iconless = component !== "Confirm" && component !== "IconButton" && component !== "ScreenLink"
            && !/\bicon=/.test(usage.attrs)
            && !(component === "ButtonLink" && /\b(newTab|chevron)\b/.test(usage.attrs))
          found.push({ file: name, component, word, icon, iconless })
        }
      }
    }
    return found
  }

  it("語の結びが決める操作のアイコンと、渡しているアイコンが一致する", async () => {
    const offenders: string[] = []
    let matched = 0

    for (const one of await pressables(await managementFiles())) {
      // A link names the screen it leads to, not an action (`ScreenLink`).
      if (one.component === "ScreenLink") continue
      if (one.word === undefined) continue // resolved from something dynamic — not counted
      const action = actionFor(one.word)
      if (action === undefined) continue // not one of the rule's endings
      if (one.icon === undefined) continue // the icon itself is dynamic — not counted
      matched += 1
      const expected: string = ACTION_ICON[action]
      if (one.icon !== expected) offenders.push(`${one.file} [${one.component}] "${one.word}": ${one.icon} (${expected} を待つ)`)
    }

    expect(offenders).toEqual([])
    // The rule has something to hold: this many admin controls have a rule-covered word.
    expect(matched).toBeGreaterThan(40)
  })

  /**
   * **The other way round: an action's glyph is not borrowed.** A control shown with
   * `lock` or `trash` reports it withdraws or deletes before its word is read, so
   * a word that is not one of those actions under that glyph is the glyph lying
   * — the merge that wore the resolve's tick, the reissue that wore the bin.
   */
  it("操作のアイコンが付いているものの語は、そのアイコンの操作を表す", async () => {
    const glyphs = new Set<string>(Object.values(ACTION_ICON))
    const offenders: string[] = []
    let matched = 0

    for (const one of await pressables(await managementFiles())) {
      if (one.component === "ScreenLink") continue
      if (one.icon === undefined || !glyphs.has(one.icon)) continue
      if (one.word === undefined) continue // resolved from something dynamic — not counted
      matched += 1
      const action = actionFor(one.word)
      if (action === undefined || ACTION_ICON[action] !== one.icon) {
        offenders.push(`${one.file} [${one.component}] "${one.word}": ${one.icon} は ${action ?? "(操作の語でない)"} のアイコンではない`)
      }
    }

    expect(offenders).toEqual([])
    expect(matched).toBeGreaterThan(40)
  })

  /**
   * **Only the cancel button has no glyph**. A row of worded buttons where one is bare reads
   * the bare one as another kind of thing; the one kind that should read so is
   * the cancel button of a panel or a transfer, which does nothing but stop.
   */
  it("アイコンの無いボタンは、キャンセル・中止・閉じるだけ", async () => {
    const files = [...await sourcesUnder("routes"), ...await sourcesUnder("components")]
      .map(({ name }) => name)
      .filter((name) => name !== "components/base.tsx")
    const ja = messagesFor("ja")
    const en = messagesFor("en")
    const OUT = new Set([ja.admin.cancel, ja.comment.close, en.comment.close])
    const offenders: string[] = []
    let bare = 0
    for (const one of await pressables(files)) {
      if (!one.iconless) continue
      bare += 1
      if (one.word === undefined || !OUT.has(one.word)) offenders.push(`${one.file} [${one.component}] "${one.word ?? "?"}"`)
    }
    expect(offenders).toEqual([])
    // The rule has something to hold: the cancel buttons it lets through are there.
    expect(bare).toBeGreaterThan(0)
  })

  /**
   * **A glyph goes where the part puts it, not among the words** (`icon`, or
   * `way` for the chevron after a way's word). Written into the children, it
   * sits wherever the caller happened to put it, outside the box the spinner
   * turns in, and a word-reading rule sees a tag where the word should be.
   */
  it("押せるものの children に Icon / Chevron を置かない", async () => {
    const files = [...await sourcesUnder("routes"), ...await sourcesUnder("components")]
    const offenders: string[] = []
    let read = 0
    for (const { name, text } of files) {
      for (const component of PRESSABLE) {
        for (const usage of findUsages(text, component)) {
          if (usage.children === null) continue
          read += 1
          if (/<(?:Icon|Chevron)\b/.test(usage.children)) offenders.push(`${name} [${component}]`)
        }
      }
    }
    expect(offenders).toEqual([])
    expect(read).toBeGreaterThan(100)
  })
})

/**
 * **A state is said by `Flag` or `Stated`, never as bare words**. Written as text in a cell, "未発行" is shown with whatever colour
 * the cell happens to have, and the same fact on the next screen is a badge;
 * named by kind, it is shown with the one colour and glyph that kind has everywhere.
 */
describe("状態の語", () => {
  const ja = messagesFor("ja")
  const t = ja.admin
  /**
   * The words that name a state some row, field or job can be in. **「未公開」
   * is not among them**: it is also the word a date that has not come yet is
   * said by (a dataset's release date), which is a missing value rather than a
   * state and stays a word.
   */
  const STATE_WORDS = new Set<string>([
    t.detail.shared, t.detail.notShared, t.detail.shareExpired, t.review.shared, t.review.unshared, t.review.expired,
    t.editor.untranslated, t.catalog.untranslated, t.templates.noHumLabel, t.research.unpinned,
    ...Object.values(t.assistant.statuses),
    t.contents.published, t.contents.scheduled,
  ])

  /** The element a child expression or text sits directly in, or null where it cannot be read. */
  function parentTag(text: string, at: number): string | null {
    const before = text.slice(Math.max(0, at - 600), at)
    return /<([A-Z]?[\w.]+)\b[^<>]*>\s*$/.exec(before)?.[1] ?? null
  }

  it("状態の語は Flag か Stated の中でだけ描く", async () => {
    const offenders: string[] = []
    let named = 0
    for (const file of await managementFiles()) {
      const text = await readFile(path.join(ROOT, file), "utf8")
      const assigns = findAssignments(text)
      const said = (at: number, word: string) => {
        const parent = parentTag(text, at)
        if (parent === null) return
        if (parent === "Flag" || parent === "Stated") named += 1
        else offenders.push(`${file}:${String(text.slice(0, at).split("\n").length)} <${parent}> ${word}`)
      }
      // A child expression: `{t.untranslated}`, or a word at the end of `{a ?? t.unpinned}`.
      for (const brace of text.matchAll(/\{([^{}]*)\}/g)) {
        for (const path of (brace[1] ?? "").matchAll(/(?<![\w.])([A-Za-z_]\w*(?:\.\w+)+)(?![\w.([])/g)) {
          const resolved = resolvePath(assigns, path[1] ?? "", brace.index)
          const value = resolved === undefined ? undefined : getAt(ja, resolved)
          if (typeof value === "string" && STATE_WORDS.has(value)) said(brace.index, value)
        }
      }
      // A word written straight into the markup.
      for (const bare of text.matchAll(/>\s*([^<>{}\n]+?)\s*</g)) {
        const word = bare[1] ?? ""
        if (STATE_WORDS.has(word)) said(bare.index + 1, word)
      }
    }
    expect(offenders).toEqual([])
    // The rule has something to hold: the state words it knows are drawn, by kind.
    expect(named).toBeGreaterThan(10)
  })
})

/**
 * **A chip and a count are parts** (`base.tsx` の `Chip` / `ValueChip` /
 * `CountBubble`). Drawn by hand, the value
 * chip had its close glyph among the words and the count on a pane had a
 * different padding from the one on the cart.
 */
describe("chip と件数の丸", () => {
  it("chip と件数の丸の形を書くのは base.tsx だけ", async () => {
    const offenders: string[] = []
    let inBase = 0
    for (const { name, text } of await everySource()) {
      for (const list of classLists(text)) {
        const one = list.split(/\s+/)
        // A chip is a badge's box: small type, the badge's padding, an edge and a corner.
        const chip = one.includes("text-xs") && one.includes("px-2") && one.includes("py-0.5")
          && one.includes("border") && (one.includes("rounded") || one.includes("rounded-full"))
        // A count is small white type on a filled disc.
        const bubble = one.includes("rounded-full") && one.includes("text-white") && one.includes("text-xs")
        if (!chip && !bubble) continue
        if (name === "components/base.tsx") inBase += 1
        else offenders.push(`${name}: ${list}`)
      }
    }
    expect(offenders).toEqual([])
    expect(inBase).toBeGreaterThan(0)
  })
})

/**
 * **One way onto the clipboard** (`base.tsx` の `CopyButton`). The four copies
 * each wrote their own, and answered the press two different ways.
 */
/**
 * **The cursor is decided once, in `app.css`**: a control that can be pressed
 * shows the pointing hand and one that cannot shows `not-allowed`. A class on a
 * control would be a second answer to the same question. The three left are
 * what the stylesheet cannot see: the box around a disabled button that shows
 * why (the button inside takes no pointer), a place in the preview that
 * takes the caret to its field, and a pane that is loading.
 */
describe("カーソル", () => {
  it("押せるかどうかのカーソルは app.css の規則だけが決める", async () => {
    const found = (await everySource()).flatMap(({ name, text }) =>
      [...text.matchAll(/\bcursor-[a-z-]+/g)].map((match) => `${name}: ${match[0]}`))
    expect(found.sort()).toEqual([
      "components/base.tsx: cursor-not-allowed",
      "components/base.tsx: cursor-progress",
      "components/page.tsx: cursor-pointer",
    ])
  })

  it("app.css が押せる要素に pointer、押せない要素に not-allowed を当てる", async () => {
    const css = await readFile(path.join(ROOT, "app.css"), "utf8")
    expect(css).toMatch(/:where\(button, \[role="button"\][^{]*\{\s*cursor: pointer;/)
    expect(css).toMatch(/:disabled,\s*:where\(\[aria-disabled="true"\]\) \{\s*cursor: not-allowed;/)
  })
})

describe("クリップボード", () => {
  it("clipboard.writeText を書くのは base.tsx だけ", async () => {
    const writing = (await everySource())
      .filter(({ text }) => text.includes("clipboard.writeText"))
      .map(({ name }) => name)
    expect(writing).toEqual(["components/base.tsx"])
  })
})

/**
 * A link's chevron moves the way it points (`base.tsx` の `Chevron`). A screen drawing the glyph itself would draw one that remains
 * still beside ones that move, and the motion would stop indicating anything.
 */
describe("向きのあるアイコン", () => {
  it("chevron-left / chevron-right を Icon で直に描くのは base.tsx だけ — 他は Chevron", async () => {
    const files = [...(await sourcesUnder("routes")), ...(await sourcesUnder("components"))]
      .filter(({ name }) => !name.endsWith("base.tsx") && !name.endsWith("icons.tsx"))
    const offenders = files
      .filter(({ text }) => /<Icon\s+name="chevron-(?:left|right)"/.test(text))
      .map(({ name }) => name)
    expect(offenders).toEqual([])
  })

  /**
   * **A link to another screen uses the bordered style**: `ScreenLink`, `AdminBack` or a
   * `ButtonLink`, all of which are the group the chevron moves with. A screen
   * that identifies the group by hand is dressing a bare word as a way — the word
   * reads as the note beside it and is found by pressing it.
   */
  it("管理画面は group/link を手で付けない — 別の画面への経路は ScreenLink / ButtonLink で描く", async () => {
    const offenders: string[] = []
    for (const file of await managementFiles()) {
      const text = await readFile(path.join(ROOT, file), "utf8")
      if (text.includes("group/link")) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})

/**
 * **An indicator on some rows takes its colour and glyph from its kind**
 * (`components/flags.tsx`). A screen that
 * chose them itself would give the same fact a second look on the next screen.
 * What is left to `Badge` is not an indicator of that sort: a label on a header bar, a
 * value drawn round (`pill`), a count beside its own glyph, and the key's type,
 * which is a kind with a glyph per type.
 */
describe("状態のバッジ", () => {
  const ALLOWED = [
    /^<Badge\s+(onHeaderBar|pill)\b/,
    /\{[\w.]+\.length\}<\/Badge>$/,
    /^<Badge icon=\{<Icon name=\{TYPE_ICON\[/,
  ]

  it("管理画面は Badge を直に描かず、マークは Flag の種類で指定する", async () => {
    const offenders: string[] = []
    for (const file of await managementFiles()) {
      const text = await readFile(path.join(ROOT, file), "utf8")
      for (const use of text.matchAll(/<Badge\b[^]*?<\/Badge>|<Badge\b[^>]*\/>/g)) {
        const drawn = use[0].replace(/\s+/g, " ")
        if (ALLOWED.some((one) => one.test(drawn))) continue
        offenders.push(`${file}:${String(text.slice(0, use.index).split("\n").length)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

/**
 * **The management area has no bare words to press**.
 * A word set beside a button in the link colour reads as a note on that button,
 * and is found to be a link only by pressing it. A link to another screen is shown with
 * the bordered style (`ScreenLink`, `AdminBack`, `ButtonLink`); a link stays bare only
 * where it is a value — an id or a count in a table's cell — and there it
 * has no class of its own.
 */
describe("字だけの経路", () => {
  /**
   * A class on a link is how a bare word gets dressed as a control — sized to
   * sit beside a button, or given the link colour it would have had anyway. The
   * classes that are not that: a style (`border`), a wrapper around a badge
   * (`no-underline`), and a value underlined where it sits (`underline`).
   */
  it("管理画面の link は、素の語に大きさや色だけを加えて操作の位置に置かない", async () => {
    const offenders: string[] = []
    for (const file of await managementFiles()) {
      const text = await readFile(path.join(ROOT, file), "utf8")
      for (const link of text.matchAll(/<(?:Link|a)\s[^>]*?\bclassName="([^"]*)"/gs)) {
        const look = link[1] ?? ""
        if (!/\bborder\b|\bunderline\b/.test(look)) offenders.push(`${file}: className="${look}"`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("管理画面は公開側の字だけの経路 (MoreLink / CLEAR) を使わない", async () => {
    const offenders: string[] = []
    for (const file of await managementFiles()) {
      const text = await readFile(path.join(ROOT, file), "utf8")
      if (/<MoreLink\b|\{CLEAR\}/.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})

/**
 * **A tag shown over a control responds to its own wrapper and nothing else**
 * (`base.tsx` の `TOOLTIP`). An unnamed `group-hover` responds to any ancestor
 * marked `group`, and a collapsible drawn around a form of toggles then shows every tag
 * in it at once while the pointer is anywhere inside.
 */
describe("ツールチップの group", () => {
  it("TOOLTIP を開くのは名前付きの group (/tip) だけ", async () => {
    const offenders: string[] = []
    for (const { name, text } of await everySource()) {
      for (const use of text.matchAll(/\$\{TOOLTIP\}[^`]*`/g)) {
        if (/\bgroup-(?:hover|focus-visible|has-focus-visible):/.test(use[0])) offenders.push(`${name}: ${use[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("名前の無い group を置かない — 中のツールチップやアイコンが外の hover に反応してしまう", async () => {
    const offenders = (await everySource())
      .filter(({ text }) => /className=["'`{][^"'`]*(?<![\w/-])group(?![\w/-])/.test(text))
      .map(({ name }) => name)
    expect(offenders).toEqual([])
  })
})

describe("メニューの 1 行", () => {
  /**
   * **`MENU_ITEM` is a line inside an opened panel and nothing else**. Drawn anywhere else it is a bare word that grows a box
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

  it("メニューの外で MENU_ITEM を付けない", async () => {
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

describe("送信中のアイコン", () => {
  /**
   * **A control that sent an action waits in place, and the parts draw that**:
   * the spinner turns in the icon's box of the
   * pressed `Submit` or `Confirm`, and a screen that drew one of its own would
   * be a second way of indicating the same thing — or a way of indicating it in a
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
   * The spinner is shown in the icon's box, so a submit without an icon would
   * grow by one box at the moment it is pressed — and everything beside it
   * would move.
   */
  it("Submit にはアイコンがある — spinner が表示される場所がそこにしか無い", async () => {
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
   * `useBusyHere` reports it after 200ms on the public side, and a management
   * listing that pinned `busy` to false said nothing however long it took.
   */
  it("一覧の busy を false に固定しない — useBusyHere が示す", async () => {
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
 * rather than from a step indicator: the
 * head names the screen and — for the research editor only — this draft's
 * other screens as facts, and the toolbar is the one thing that stays while
 * typing.
 */
describe("下書きの画面上部の欄とツールバー", () => {
  /** The five screens' own files — not `draft-tools.tsx` or `admin.tsx`, which draw the shape the five are shown in. */
  async function draftScreenSources(): Promise<{ name: string, text: string }[]> {
    const routes = (await sourcesUnder("routes")).filter(({ name }) => name.startsWith("routes/admin-draft"))
    const parts = ["components/dataset-editor.tsx", "components/editor.tsx", "components/publish.tsx", "components/review.tsx"]
    const components = await Promise.all(parts.map(async (name) => ({
      name, text: await readFile(path.join(ROOT, name), "utf8"),
    })))
    return [...routes, ...components]
  }

  it("下書きの 5 画面のどこにも stepper (DraftSteps) は無い", async () => {
    const drawn = (await draftScreenSources())
      .filter(({ text }) => /<DraftSteps\b/.test(text))
      .map(({ name }) => name)
    expect(drawn).toEqual([])
  })

  it("ツールバー (DraftTools) を描くのは editor と dataset-editor の 2 つで、sticky は画面上部の欄 (DraftHead) だけが管理する", async () => {
    const sources = await draftScreenSources()
    const drawsTools = sources.filter(({ text }) => /<DraftTools\b/.test(text)).map(({ name }) => name).sort()
    expect(drawsTools).toEqual(["components/dataset-editor.tsx", "components/editor.tsx"])
    // The five screens' own files never write `sticky` themselves — it is `DraftHead`'s alone (`draft-tools.tsx`),
    // the card that collapses to the toolbar and stays.
    const stickyHere = sources.filter(({ text }) => /\bsticky\b/.test(text)).map(({ name }) => name)
    expect(stickyHere).toEqual([])
    const tools = await readFile(path.join(ROOT, "components/draft-tools.tsx"), "utf8")
    const head = tools.slice(tools.indexOf("export function DraftHead"), tools.indexOf("export function DraftTools"))
    expect(head.match(/\bsticky\b/g)).toHaveLength(1)
    expect(tools.match(/\bsticky\b/g)).toHaveLength(1)
  })

  it("画面上部の欄の 2 行目のリンクは ScreenLink (outline のボタン + 語の後ろの chevron) で、番号は付かない", async () => {
    const text = await readFile(path.join(ROOT, "components/editor.tsx"), "utf8")
    const start = text.indexOf("function DraftOverview")
    expect(start).toBeGreaterThan(-1)
    const end = text.indexOf("\nfunction ", start + 1)
    const body = text.slice(start, end === -1 ? undefined : end)
    expect([...body.matchAll(/<ScreenLink\b/g)]).toHaveLength(4)
    // The transition chevron is `ScreenLink`'s own; the row draws neither a chevron nor a step number itself.
    expect(body).not.toContain("chevron-right")
    expect(body).not.toMatch(/>\s*\{at \+ 1\}\s*</)
  })

  it("記事とお知らせはツールバー (ArticleTools) を画面上部の欄に渡し、sticky は自分でも contents.tsx でも書かない", async () => {
    const routeNames = ["routes/admin-document.tsx", "routes/admin-news-item.tsx"]
    const routes = await Promise.all(routeNames.map(async (name) => ({
      name, text: await readFile(path.join(ROOT, name), "utf8"),
    })))
    const handsTools = routes.filter(({ text }) => text.includes("tools={panes.tools}")).map(({ name }) => name)
    expect(handsTools).toEqual(routeNames)
    // The header (`DraftHead`) is what sticks; neither screen nor `ArticleTools` writes `sticky`.
    const stickyHere = routes.filter(({ text }) => /\bsticky\b/.test(text)).map(({ name }) => name)
    expect(stickyHere).toEqual([])

    const contents = await readFile(path.join(ROOT, "components/contents.tsx"), "utf8")
    expect(contents.match(/\bsticky\b/g)?.length ?? 0).toBe(0)
  })
})

/**
 * **One part per shape**. Each of
 * these was drawn by hand on several screens, and each copy drifted on its own
 * — a listing that dropped its ordering after a search, a row's arrows dimmed
 * by a box around them, a table swapped for a sentence when it was empty, an
 * answer said four different ways.
 */
describe("部品への集約", () => {
  const screens = async () => await everySource()

  it("キーワード欄の placeholder と送信ボタンの語は、どの一覧でも「キーワード検索」と「検索」", async () => {
    const offenders: string[] = []
    let boxes = 0
    for (const { name, text } of await screens()) {
      if (name === "components/search.tsx") continue
      for (const { attrs } of findUsages(text, "SearchBox")) {
        boxes += 1
        if (!attrs.includes("placeholder={messages.search.searchHint}")) offenders.push(`${name}: placeholder`)
        if (!attrs.includes("submit={messages.search.submit}")) offenders.push(`${name}: submit`)
      }
    }
    expect(offenders).toEqual([])
    expect(boxes).toBeGreaterThan(5)
  })

  it("行の上げ下げは ReorderButtons だけが描き、押せない見た目は IconButton 自身が定義する", async () => {
    const offenders: string[] = []
    for (const { name, text } of await screens()) {
      if (name === "components/base.tsx") continue
      for (const { attrs } of findUsages(text, "IconButton")) {
        if (/name="chevron-(up|down)"/.test(attrs)) offenders.push(`${name}: IconButton ${/chevron-\w+/.exec(attrs)?.[0] ?? ""}`)
      }
      // A faded box around a control is the hand-made pressed-out look.
      if (/(?<![:\w-])opacity-50\b/.test(text) && name !== "components/form.tsx") offenders.push(`${name}: opacity-50`)
    }
    expect(offenders).toEqual([])
  })

  // 管理画面の表だけを見る。公開の研究のページの節 (提供者・助成金 …) は、空でも節を残して
  // 無いことを 1 文で示す形なので、ここでは見ない。
  it("管理画面の空の一覧は表ごと差し替えず、Table の whenEmpty が 1 行で示す", async () => {
    const offenders: string[] = []
    for (const name of await managementFiles()) {
      const text = await readFile(path.join(ROOT, name), "utf8")
      // `… ? <Empty>…</Empty> : (… <Table` — the table and its sentence as two alternatives.
      if (/\?\s*(?:\(\s*)?<Empty>[^]{0,120}?<\/Empty>\s*(?:\)\s*)?:\s*\(?\s*(?:<>\s*)?<Table\b/.test(text)) offenders.push(name)
    }
    expect(offenders).toEqual([])
  })

  it("識別子の先頭のアイコン (book / database) を字の隣に置くのは IdWithIcon だけ", async () => {
    const offenders: string[] = []
    for (const { name, text } of await screens()) {
      if (name === "components/page.tsx") continue
      for (const { attrs } of findUsages(text, "Icon")) {
        if (/name="(book|database)"/.test(attrs) && attrs.includes("text-ink-muted")) offenders.push(`${name}: ${/name="\w+"/.exec(attrs)?.[0] ?? ""}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("操作結果を枠線で囲んで表示するのは Answer だけ — 画面は Answered も Result も直に描かない", async () => {
    const writers = (await screens())
      .filter(({ text }) => /<(Answered|Result)\b/.test(text))
      .map(({ name }) => name)
    expect(writers).toEqual(["components/form.tsx"])
  })

  it("確認のダイアログはキャンセルの語を渡さず、意図は intent に載せる", async () => {
    const offenders: string[] = []
    let confirms = 0
    for (const { name, text } of await screens()) {
      for (const { attrs, children } of findUsages(text, "Confirm")) {
        if (name === "components/base.tsx") continue
        confirms += 1
        if (/\bcancel=/.test(attrs)) offenders.push(`${name}: cancel`)
        if (children?.includes("name=\"intent\"") === true) offenders.push(`${name}: hidden intent`)
      }
      for (const { attrs } of findUsages(text, "Dialog")) {
        if (/\bdismiss=\{[\w.]*\.cancel\}/.test(attrs)) offenders.push(`${name}: Dialog dismiss`)
      }
    }
    expect(offenders).toEqual([])
    expect(confirms).toBeGreaterThan(15)
  })

  it("表の操作の列の名前を読むのは Table だけ", async () => {
    const readers = (await screens())
      .filter(({ text }) => /\.admin\.actions\b/.test(text))
      .map(({ name }) => name)
    expect(readers).toEqual(["components/page.tsx"])
  })

  it("名前と値の 2 列を手で組まない — Facts / Pairs が組む", async () => {
    const offenders = (await screens())
      .filter(({ name, text }) => name !== "components/page.tsx" && text.includes("grid-cols-[auto_1fr]"))
      .map(({ name }) => name)
    expect(offenders).toEqual([])
  })

  it("小さい見出し語の見た目は PANE_LABEL を参照し、値をコピーしない", async () => {
    const offenders = (await screens())
      .filter(({ name, text }) => name !== "components/base.tsx" && text.includes("\"font-semibold text-ink-muted text-xs\""))
      .map(({ name }) => name)
    expect(offenders).toEqual([])
  })

  it("HeaderBar 付きのカードは HeaderBarSection — 画面は HeaderBar をカードに自分で敷かない", async () => {
    const offenders = (await screens())
      .filter(({ name, text }) => name !== "components/page.tsx" && /<HeaderBar\b/.test(text))
      .map(({ name }) => name)
    expect(offenders).toEqual([])
  })
})
