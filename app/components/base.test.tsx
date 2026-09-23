import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { Button, Chevron, Chip, Clamped, Confirm, Fold, foldShown, PaneHeading, Stated } from "./base"

/** Rendered at an address, since a part may hold a link. */
function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/research"]} />)
}

const many = (count: number) =>
  Array.from({ length: count }, (_, at) => `JGAD${String(at + 1).padStart(6, "0")}`)

function clamped(count: number): string {
  return render(
    <Clamped
      items={many(count)}
      more={(rest) => `他 ${String(rest)} 件`}
      less="閉じる"
    />,
  )
}

describe("a list cut short", () => {
  it("shows everything while there is nothing to cut", () => {
    const html = clamped(3)
    expect(html).toContain("JGAD000003")
    expect(html).not.toContain("他 ")
  })

  /**
   * The control is a line of its own, so trading the last entry for it shows
   * less in the same room. Measured over a hundred research rows, no cell with
   * one entry left over decided its own row's height.
   */
  it("keeps the last entry rather than hiding one behind a control", () => {
    const html = clamped(4)
    expect(html).toContain("JGAD000004")
    expect(html).not.toContain("他 ")
  })

  it("cuts once more than one would be hidden, and says how many", () => {
    const html = clamped(5)
    expect(html).toContain("JGAD000003")
    expect(html).not.toContain("JGAD000004")
    expect(html).toContain("他 2 件")
  })

  it("counts what is hidden, not what is shown", () => {
    expect(clamped(47)).toContain("他 44 件")
  })
})

/** What a part draws, with the words only a screen reader hears taken out. */
function visible(html: string): string {
  return html.replace(/<span class="sr-only">.*?<\/span>/g, "").replace(/<[^>]+>/g, "")
}

/**
 * A glyph has no baseline, so a box placed by its first item's baseline is
 * placed by the glyph's bottom edge and stretches the line it stands in. The
 * pair takes a box of one line's height and sits at the top of it instead, the
 * way a badge does (`docs/ui.md` の「壊れるもの」).
 */
describe("a state every row carries", () => {
  it("takes one line's height and sits at the top of it, so it has no baseline to be placed by", () => {
    const html = render(<Stated icon="eye">公開中</Stated>)
    const box = (/<span class="([^"]*)"><svg/.exec(html)?.[1] ?? "").split(/\s+/)
    expect(box).toContain("h-[1lh]")
    expect(box).toContain("align-top")
    expect(box).toContain("items-center")
    expect(html).toContain("公開中")
  })
})

describe("the name of a pane", () => {
  it("is a second-level heading, or a third where the pane sits under one", () => {
    expect(render(<PaneHeading title="絞り込み" />)).toContain("<h2")
    expect(render(<PaneHeading title="絞り込み" level="h3" />)).toContain("<h3")
  })

  /**
   * The rule is pulled out through the card's padding so that it stands on the
   * same line as the page heading's own; the line under it belongs to the pane
   * and spans it. Moving the pull onto the row would drag the line out too, and
   * the pane would read as hanging off the left of everything below it.
   */
  it("hangs the rule out of the card without dragging the line with it", () => {
    const html = render(<PaneHeading title="絞り込み" />)
    const row = /<div class="([^"]*border-b[^"]*)"/.exec(html)?.[1] ?? ""
    const heading = /<h2 class="([^"]*)"/.exec(html)?.[1] ?? ""
    expect(row).not.toContain("-ml-6")
    expect(heading).toContain("-ml-6")
    expect(heading).toContain("border-l-4")
  })

  /*
    The other place a mark may stand: at the start of the thing it names, for a
    pane with no edge of the card to line up with. What must not move with it is
    the line, which is the pane's either way. **The gap goes with the mark**:
    hung out it has to leave room for the words to land back on the content
    edge, standing at the start it only has to bind itself to the word.
  */
  it("stands the rule at the start when asked, without moving the line", () => {
    const html = render(<PaneHeading title="絞り込み" rule="start" />)
    const row = /<div class="([^"]*border-b[^"]*)"/.exec(html)?.[1] ?? ""
    const heading = /<h2 class="([^"]*)"/.exec(html)?.[1] ?? ""
    expect(heading).not.toContain("-ml-6")
    expect(heading).toContain("border-l-4")
    // The hung-out gap would put the words 10px left of everything under them.
    expect(heading).not.toContain("pl-5")
    expect(row).toContain("border-b")
    expect(row).not.toContain("-ml-6")
  })

  it("keeps what shares its line out of the heading's own name", () => {
    const html = render(<PaneHeading title="絞り込み"><span>すべて解除</span></PaneHeading>)
    const named = /<h2[^>]*>(.*?)<\/h2>/.exec(html)?.[1] ?? ""
    expect(named).toContain("絞り込み")
    expect(named).not.toContain("すべて解除")
    expect(html).toContain("すべて解除")
  })
})

describe("a condition in force", () => {
  it("is one link, so what is drawn and what is undone are the same thing", () => {
    const html = render(<Chip field="性別" value="男性" to="/research" remove="解除" />)
    expect((html.match(/<a /g) ?? []).length).toBe(1)
  })

  it("draws what the condition is about before what it says", () => {
    expect(visible(render(<Chip field="性別" value="男性" to="/research" remove="解除" />)))
      .toBe("性別男性")
  })

  it("draws only the value when the condition names no field", () => {
    expect(visible(render(<Chip value="title:ゲノム" to="/research" remove="解除" />)))
      .toBe("title:ゲノム")
  })

  /** The glyph is hidden, so without this the link is read out as "link". */
  it("says what pressing it takes off", () => {
    expect(render(<Chip field="性別" value="男性" to="/research" remove="性別: 男性 を解除" />))
      .toContain("性別: 男性 を解除")
  })
})

describe("a part of a panel that folds", () => {
  it("is open while there is a reason for it to be", () => {
    expect(render(<Fold summary="疾患" open>C34</Fold>)).toContain("<details open")
  })

  it("is shut when there is none", () => {
    expect(render(<Fold summary="疾患">C34</Fold>)).not.toContain("<details open")
  })

  it("opens when a reason appears", () => {
    expect(foldShown(false, true)).toBe(true)
  })

  /**
   * The reason going away is not the reader asking for the section to be put
   * away. Written as the reason alone, lifting the last condition of a facet
   * would fold it up under a reader who was reading it.
   */
  it("stays open when the reason goes away, which nobody asked for", () => {
    expect(foldShown(true, false)).toBe(true)
  })

  it("stays shut while nothing has opened it", () => {
    expect(foldShown(false, false)).toBe(false)
  })

  /**
   * The same distances either way, but only one of them is inside the thing
   * that gets pressed: on the `<details>` it left a 22.4px target — the line of
   * words and nothing else — under 8px of margin nobody could press.
   */
  it("puts its padding inside the thing that gets pressed", () => {
    const html = render(<Fold summary="疾患">C34</Fold>)

    expect(html).toMatch(/<summary[^>]*\bpy-2\b/)
    expect(html).not.toMatch(/<details[^>]*\bpy-2\b/)
  })
})

/**
 * A question raised by something that happened, rather than by a control:
 * files chosen whose names the box already holds. What raised it is the way in,
 * so the panel draws none of its own.
 */
describe("a question held open from outside", () => {
  const question = (open: boolean) => render(
    <Confirm
      held={{ open, close: () => undefined }}
      title="同じ名前のファイルの上書き"
      warning="2 件が既にあります: a.zip, b.zip。上書きすると、いまのファイルは元に戻せません。"
      confirm="上書き"
      cancel="キャンセル"
      onConfirm={() => undefined}
    />,
  )

  it("draws no way in, and nothing at all while it is shut", () => {
    const html = question(false)
    expect(html).not.toContain("<button")
    expect(html).not.toContain("同じ名前のファイルの上書き")
  })

  it("asks with the sentence and both answers once it is open, and the deed sends no form", () => {
    const html = question(true)
    expect(html).toContain("同じ名前のファイルの上書き")
    expect(html).toContain("2 件が既にあります: a.zip, b.zip。")
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html).toContain("キャンセル")
    expect(html).toContain("上書き</button>")
    expect(html).not.toContain("type=\"submit\"")
  })

  it("waits for nothing while nothing has been pressed: both answers can be pressed, and no spinner turns", () => {
    const html = question(true)
    expect(html).not.toMatch(/<button[^>]*\bdisabled=""/)
    expect(html).not.toContain("aria-busy")
    expect(html).not.toContain("animate-spin")
    expect(html).not.toContain("role=\"status\"")
  })
})

describe("a control that cannot be pressed", () => {
  const html = render(<Button disabled="使われているので削除できません。">削除</Button>)

  it("stays on the screen, disabled, rather than being taken away", () => {
    expect(html).toContain("削除")
    expect(html).toMatch(/<button[^>]*\bdisabled=""/)
  })

  it("says why over itself, and the reason is read out with it", () => {
    const [, id] = /role="tooltip"[^>]*>|id="([^"]+)"[^>]*role="tooltip"/.exec(html) ?? []
    expect(html).toContain("role=\"tooltip\"")
    expect(html).toContain("使われているので削除できません。")
    expect(id).toBeDefined()
    expect(html).toMatch(new RegExp(`<button[^>]*aria-describedby="${id ?? ""}"`))
  })

  it("lets the pointer through to what stands the reason up, which can also take focus", () => {
    expect(html).toMatch(/<span[^>]*tabindex="0"[^>]*>/)
    expect(html).toContain("pointer-events-none")
  })

  it("hangs the reason from the right, or from the left when it stands at the left of a row", () => {
    expect(html).toMatch(/role="tooltip"[^>]*right-0|right-0[^>]*role="tooltip"/)
    const left = render(<Button disabled="理由" reasonAt="left">表示</Button>)
    expect(left).toMatch(/role="tooltip"[^>]*left-0|left-0[^>]*role="tooltip"/)
    expect(left).not.toContain("right-0")
  })

  it("is an ordinary button, with nothing over it, while it can be pressed or is merely off", () => {
    expect(render(<Button>削除</Button>)).not.toContain("tooltip")
    const off = render(<Button disabled>削除</Button>)
    expect(off).toMatch(/<button[^>]*\bdisabled=""/)
    expect(off).not.toContain("tooltip")
  })

  it("is the same control whether a panel's way in or a plain one", () => {
    const wayIn = render(
      <Confirm label="削除" title="x の削除" warning="削除されます。元に戻せません。" confirm="削除" cancel="キャンセル" disabled="使われています。" />,
    )
    expect(wayIn).toContain("role=\"tooltip\"")
    expect(wayIn).toContain("使われています。")
    expect(wayIn).toMatch(/<button[^>]*\bdisabled=""/)
  })
})

/**
 * The mark of a way moves the way it points while the control it stands in is
 * pointed at — and only then, and only for those who allow motion.
 */
describe("Chevron", () => {
  it("points and moves left, or right, as told", () => {
    const left = render(<Chevron dir="left" />)
    expect(left).toContain("group-hover/way:-translate-x-0.5")
    expect(left).toContain("group-focus-visible/way:-translate-x-0.5")
    expect(left).toContain("motion-safe:transition-transform")
    const right = render(<Chevron dir="right" />)
    expect(right).toContain("group-hover/way:translate-x-0.5")
    expect(right).not.toContain("-translate-x-0.5")
  })

  it("is hidden from readers — the word beside it says where", () => {
    expect(render(<Chevron dir="right" />)).toContain("aria-hidden=\"true\"")
  })

  it("moves inside any Button, which is the group it answers to", () => {
    const html = render(<Button type="button" icon={<Chevron dir="right" />}>研究へ</Button>)
    expect(html).toMatch(/<button[^>]*class="[^"]*\bgroup\/way\b/)
  })
})
