import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import fc from "fast-check"

import { linksIn } from "./_links"
import { Button, ButtonLink, Chevron, Chip, Clamped, Confirm, CopyButton, copyText, CountBubble, Collapsible, collapsibleOpen, Dialog, IconButton, type DialogSubject, PanelButton, PaneHeading, ReorderButtons, startAtTop, MoreLink, ValueChip, wentThrough } from "./base"
import { Stated } from "./flags"

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

describe("a truncated list", () => {
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

  it("cuts once more than one would be hidden, and shows how many", () => {
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
 * placed by the glyph's bottom edge and stretches the line it is shown in. The
 * pair takes a box of one line's height and sits at the top of it instead, the
 * way a badge does.
 */
describe("a state every row has", () => {
  it("takes one line's height and sits at the top of it, so it has no baseline to be placed by", () => {
    const html = render(<Stated kind="live">公開中</Stated>)
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
   * The rule is pulled out through the card's padding so that it is shown on the
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
    The other place an indicator may stand: at the start of the thing it identifies, for a
    pane with no edge of the card to line up with. What must not move with it is
    the line, which is the pane's either way. **The gap goes with the indicator**:
    hung out it has to leave room for the words to land back on the content
    edge, shown at the start it only has to bind itself to the word.
  */
  it("keeps the rule at the start when asked, without moving the line", () => {
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

  it("draws what the condition is about before what it shows", () => {
    expect(visible(render(<Chip field="性別" value="男性" to="/research" remove="解除" />)))
      .toBe("性別男性")
  })

  it("draws only the value when the condition names no field", () => {
    expect(visible(render(<Chip value="title:ゲノム" to="/research" remove="解除" />)))
      .toBe("title:ゲノム")
  })

  /** The glyph is hidden, so without this the link is read out as "link". */
  it("shows what pressing it takes off", () => {
    expect(render(<Chip field="性別" value="男性" to="/research" remove="性別: 男性 を解除" />))
      .toContain("性別: 男性 を解除")
  })
})

describe("a part of a panel that collapses", () => {
  it("is open while there is a reason for it to be", () => {
    expect(render(<Collapsible summary="疾患" open>C34</Collapsible>)).toContain("<details open")
  })

  it("is shut when there is none", () => {
    expect(render(<Collapsible summary="疾患">C34</Collapsible>)).not.toContain("<details open")
  })

  it("opens when a reason appears", () => {
    expect(collapsibleOpen(false, true)).toBe(true)
  })

  /**
   * The reason going away is not the reader requesting the section to be put
   * away. Written as the reason alone, lifting the last condition of a facet
   * would collapse it up under a reader who was reading it.
   */
  it("stays open when the reason goes away, which nobody asked for", () => {
    expect(collapsibleOpen(true, false)).toBe(true)
  })

  it("stays shut while nothing has opened it", () => {
    expect(collapsibleOpen(false, false)).toBe(false)
  })

  /**
   * The same distances either way, but only one of them is inside the thing
   * that gets pressed: on the `<details>` it left a 22.4px target — the line of
   * words and nothing else — under 8px of margin nobody could press.
   */
  it("puts its padding inside the thing that gets pressed", () => {
    const html = render(<Collapsible summary="疾患">C34</Collapsible>)

    expect(html).toMatch(/<summary[^>]*\bpy-2\b/)
    expect(html).not.toMatch(/<details[^>]*\bpy-2\b/)
  })
})

/**
 * A question raised by something that happened, rather than by a control:
 * files chosen whose names the box already holds. What raised it is the trigger,
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

  it("draws no trigger, and nothing at all while it is shut", () => {
    const html = question(false)
    expect(html).not.toContain("<button")
    expect(html).not.toContain("同じ名前のファイルの上書き")
  })

  it("shows the sentence and both answers once it is open, and the action sends no form", () => {
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

  it("shows why over itself, and the reason is read out with it", () => {
    const [, id] = /role="tooltip"[^>]*>|id="([^"]+)"[^>]*role="tooltip"/.exec(html) ?? []
    expect(html).toContain("role=\"tooltip\"")
    expect(html).toContain("使われているので削除できません。")
    expect(id).toBeDefined()
    expect(html).toMatch(new RegExp(`<button[^>]*aria-describedby="${id ?? ""}"`))
  })

  it("lets the pointer through to what shows the reason, which can also take focus", () => {
    expect(html).toMatch(/<span[^>]*tabindex="0"[^>]*>/)
    expect(html).toContain("pointer-events-none")
  })

  it("hangs the reason from the right, or from the left when it is shown at the left of a row", () => {
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

  it("is the same control whether a panel's trigger or a plain one", () => {
    const trigger = render(
      <Confirm label="削除" title="x の削除" warning="削除されます。元に戻せません。" confirm="削除" cancel="キャンセル" disabled="使われています。" />,
    )
    expect(trigger).toContain("role=\"tooltip\"")
    expect(trigger).toContain("使われています。")
    expect(trigger).toMatch(/<button[^>]*\bdisabled=""/)
  })
})

/**
 * The chevron of a link moves the way it points while the control it is shown in is
 * pointed at — and only then, and only for those who allow motion.
 */
describe("Chevron", () => {
  it("points and moves left, or right, as told", () => {
    const left = render(<Chevron dir="left" />)
    expect(left).toContain("group-hover/link:-translate-x-0.5")
    expect(left).toContain("group-focus-visible/link:-translate-x-0.5")
    expect(left).toContain("motion-safe:transition-transform")
    const right = render(<Chevron dir="right" />)
    expect(right).toContain("group-hover/link:translate-x-0.5")
    expect(right).not.toContain("-translate-x-0.5")
  })

  it("is hidden from readers — the word beside it shows where", () => {
    expect(render(<Chevron dir="right" />)).toContain("aria-hidden=\"true\"")
  })

  it("moves inside any Button, which is the group it responds to", () => {
    const html = render(<Button type="button" icon={<Chevron dir="right" />}>研究へ</Button>)
    expect(html).toMatch(/<button[^>]*class="[^"]*\bgroup\/link\b/)
  })
})

describe("an indicator in a line of text (PanelButton)", () => {
  it("is 24px tall whether or not it has a word, so a glyph alone does not sit lower than the word beside it", () => {
    const bare = render(<PanelButton icon="comment" label="コメント" onClick={() => undefined} />)
    const worded = render(<PanelButton icon="diff" onClick={() => undefined}>変更あり</PanelButton>)
    for (const html of [bare, worded]) {
      const classes = (/<button[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "").split(/\s+/)
      expect(classes).toContain("min-h-6")
      // The reach is widened past the box rather than the box grown.
      expect(classes).toContain("after:-inset-y-2")
    }
  })

  it("names itself where the words shown are not a name", () => {
    const html = render(<PanelButton icon="comment" label="コメント" onClick={() => undefined}>2</PanelButton>)
    expect(html).toContain("<span class=\"sr-only\">コメント</span>")
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
  })
})

describe("a way that opens a new tab (ButtonLink newTab)", () => {
  it("draws the external glyph itself and shows the new tab in words", () => {
    const html = render(<ButtonLink to="/x.pdf" external newTab newTabLabel=" (新しいタブで開きます)">PDF</ButtonLink>)
    expect(html).toMatch(/<a[^>]*target="_blank"/)
    expect(html).toContain("<span class=\"sr-only\"> (新しいタブで開きます)</span>")
    // The glyph is the external one, drawn before the words.
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("PDF"))
    expect(html).toContain("M15 3h6v6")
  })

  it("will not be written without the words, or with a glyph of the caller's", () => {
    // @ts-expect-error — a new tab has to be said, not only drawn
    void (<ButtonLink to="/x" newTab>x</ButtonLink>)
    // @ts-expect-error — the glyph of a way that leaves is the part's, not the caller's
    void (<ButtonLink to="/x" newTab newTabLabel="n" icon={<Chevron dir="right" />}>x</ButtonLink>)
  })

  it("ends a link to another screen in the chevron that moves (chevron)", () => {
    const html = render(<ButtonLink to="/cart" chevron>カートを見る</ButtonLink>)
    expect(html.indexOf("カートを見る")).toBeLessThan(html.indexOf("<svg"))
    expect(html).toContain("group-hover/link:translate-x-0.5")
  })
})

describe("a picked value (ValueChip)", () => {
  it("is one button: the value, the close glyph after it, and the sentence indicating what pressing does", () => {
    const html = render(<ValueChip remove="解除" onRemove={() => undefined}>肺癌</ValueChip>)
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html.indexOf("肺癌")).toBeLessThan(html.indexOf("<svg"))
    expect(html).toContain("<span class=\"sr-only\">解除</span>")
    // The badge's style: small type, a muted edge.
    expect(html).toMatch(/class="[^"]*\btext-xs\b[^"]*\bborder-line-strong\b|class="[^"]*\bborder-line-strong\b[^"]*\btext-xs\b/)
  })

  it("stays on the screen when it cannot be pressed", () => {
    expect(render(<ValueChip remove="解除" disabled onRemove={() => undefined}>肺癌</ValueChip>)).toContain("disabled=\"\"")
  })
})

describe("a count riding on a control (CountBubble)", () => {
  it("draws nothing for none, so an empty cart has no disc", () => {
    expect(render(<CountBubble count={0} />)).toBe(render(null))
    expect(render(<CountBubble count={-1} />)).toBe(render(null))
  })

  it("is kept from readers, since the control shows the number in its own name", () => {
    const html = render(<CountBubble count={3} tone="brand" />)
    expect(html).toContain("aria-hidden=\"true\"")
    expect(html).toContain(">3<")
    expect(html).toContain("bg-brand")
    expect(html).not.toContain("absolute")
    expect(render(<CountBubble count={3} floating />)).toContain("absolute")
  })
})

describe("copying (CopyButton)", () => {
  const html = render(<CopyButton text="hum0001" label="コピー" done="コピーしました" byHand="手でコピー" />)

  it("holds both words in one cell before anything is pressed, so responding does not change its width", () => {
    const cell = /<span class="grid">([\s\S]*?)<\/span><\/button>/.exec(html)?.[1] ?? ""
    expect(cell).toMatch(/<span aria-hidden="false" class="col-start-1 row-start-1 ">コピー<\/span>/)
    expect(cell).toMatch(/<span aria-hidden="true" class="col-start-1 row-start-1 invisible">コピーしました<\/span>/)
  })

  it("keeps a status beside it from the start, empty, for the answer to be read out by", () => {
    expect(html).toMatch(/<\/button><span role="status" class="sr-only"><\/span>$/)
  })

  it("offers itself with the copy glyph", () => {
    expect(html).toContain("<rect width=\"14\" height=\"14\"")
  })
})

describe("an icon-only control that cannot be pressed (IconButton)", () => {
  it("dims itself and stops responding to the pointer, with no box wrapped round it", () => {
    const html = render(<IconButton name="chevron-up" label="上へ" disabled />)
    const classes = /class="([^"]*)"/.exec(html)?.[1]?.split(/\s+/) ?? []
    expect(classes).toContain("disabled:opacity-50")
    // The cursor comes from the stylesheet's rule for a disabled control, not from a class here.
    expect(classes.filter((one) => one.includes("cursor-"))).toEqual([])
    // The hover fill is kept for a control that can be pressed.
    expect(classes.filter((one) => one.startsWith("hover:"))).toEqual([])
    expect(classes).toContain("enabled:hover:bg-surface-hover")
  })
})

describe("moving a row (ReorderButtons)", () => {
  const buttons = (html: string) => [...html.matchAll(/<button[^>]*>/g)].map((match) => match[0])

  it("presses out the end a row cannot move past, and only that one", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 30 }), fc.nat(), (of, seed) => {
      const at = seed % of
      const [up, down] = buttons(render(<ReorderButtons at={at} of={of} labels={{ up: "上へ", down: "下へ" }} onMove={() => undefined} />))
      expect(up).toContain("aria-label=\"上へ\"")
      expect(down).toContain("aria-label=\"下へ\"")
      expect(up?.includes(" disabled=\"\"")).toBe(at === 0)
      expect(down?.includes(" disabled=\"\"")).toBe(at === of - 1)
    }))
  })

  it("submits when each direction is put in a form, and is a plain button otherwise", () => {
    const inForm = render(
      <ReorderButtons
        at={1}
        of={3}
        labels={{ up: "上へ", down: "下へ" }}
        render={(by, button) => <form data-by={by}>{button}</form>}
      />,
    )
    expect(inForm).toContain("data-by=\"-1\"")
    expect(inForm).toContain("data-by=\"1\"")
    expect(buttons(inForm).every((one) => one.includes("type=\"submit\""))).toBe(true)
    const inPage = render(<ReorderButtons at={1} of={3} labels={{ up: "上へ", down: "下へ" }} onMove={() => undefined} />)
    expect(buttons(inPage).every((one) => one.includes("type=\"button\""))).toBe(true)
  })

  it("submits the form each direction names, where the row is a form that cannot hold them", () => {
    const [up, down] = buttons(render(
      <ReorderButtons at={1} of={3} labels={{ up: "上へ", down: "下へ" }} form={(by) => (by === -1 ? "f-up" : "f-down")} />,
    ))
    expect(up).toContain("form=\"f-up\"")
    expect(down).toContain("form=\"f-down\"")
    expect([up, down].every((one) => one?.includes("type=\"submit\""))).toBe(true)
  })
})

describe("copyText", () => {
  function methods(over: Partial<Parameters<typeof copyText>[1]> = {}) {
    const calls: string[] = []
    return {
      calls,
      given: {
        clipboard: {
          writeText: (text: string) => {
            calls.push(`clipboard:${text}`)
            return Promise.resolve()
          },
        },
        copySelection: (text: string) => {
          calls.push(`selection:${text}`)
          return true
        },
        show: (text: string) => { calls.push(`show:${text}`) },
        ...over,
      },
    }
  }

  it("uses the Clipboard API when there is one and it accepts", async () => {
    const { calls, given } = methods()
    await expect(copyText("/files/a.txt", given)).resolves.toBe("copied")
    expect(calls).toEqual(["clipboard:/files/a.txt"])
  })

  it("copies the selection when the page has no Clipboard API (plain http)", async () => {
    const { calls, given } = methods({ clipboard: undefined })
    await expect(copyText("x", given)).resolves.toBe("copied")
    expect(calls).toEqual(["selection:x"])
  })

  it("copies the selection when the Clipboard API refuses", async () => {
    const { calls, given } = methods({ clipboard: { writeText: () => Promise.reject(new Error("denied")) } })
    await expect(copyText("x", given)).resolves.toBe("copied")
    expect(calls).toEqual(["selection:x"])
  })

  it("shows the text when the selection copy reports failure too", async () => {
    const { calls, given } = methods({ clipboard: undefined, copySelection: () => false })
    await expect(copyText("x", given)).resolves.toBe("shown")
    expect(calls).toEqual(["show:x"])
  })

  it("shows the text when the selection copy throws", async () => {
    const { calls, given } = methods({
      clipboard: undefined,
      copySelection: () => {
        throw new Error("no document")
      },
    })
    await expect(copyText("x", given)).resolves.toBe("shown")
    expect(calls).toEqual(["show:x"])
  })
})

describe("where a panel starts once shown", () => {
  function panel(scrollTop: number) {
    const focused: FocusOptions[] = []
    const box = {
      scrollTop,
      focus: (options?: FocusOptions) => {
        focused.push(options ?? {})
      },
    }
    return { box, focused }
  }

  it("goes back to its top and takes the caret itself wherever the first control scrolled it", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100_000 }), (scrolled) => {
      const { box, focused } = panel(scrolled)
      startAtTop(box)
      expect(box.scrollTop).toBe(0)
      expect(focused).toEqual([{ preventScroll: true }])
    }))
  })

  it("takes the caret itself even when the first control is in view", () => {
    const { box, focused } = panel(0)
    startAtTop(box)
    expect(box.scrollTop).toBe(0)
    expect(focused).toEqual([{ preventScroll: true }])
  })

  it("can take the caret, so that it can hold it at its top", () => {
    const html = render(<Dialog title="研究の変更点" held={{ open: true, close: () => undefined }}><p>x</p></Dialog>)
    expect(html).toMatch(/<dialog[^>]*tabindex="-1"/)
  })

  it("draws no ring while it holds the caret, a question as well as a form", () => {
    const held = { open: true, close: () => undefined }
    for (const html of [
      render(<Dialog title="研究の変更点" held={held}><input name="x" /></Dialog>),
      render(<Confirm title="記事の削除" warning="元に戻せません。" confirm="削除" held={held} />),
    ]) {
      expect(html).toMatch(/<dialog[^>]*class="[^"]*\boutline-none\b/)
    }
  })
})

/**
 * A panel that sends a form shuts once what it sent has gone through, and stays
 * open over a refusal with what was typed in it.
 */
describe("whether what a panel sent went through", () => {
  it("did when the action answered by moving the screen, which leaves no answer behind", () => {
    expect(wentThrough(undefined)).toBe(true)
    expect(wentThrough(null)).toBe(true)
  })

  it("did when the answer is ok", () => {
    expect(wentThrough({ status: "ok", did: "create-term" })).toBe(true)
  })

  it("did not when the answer names anything else", () => {
    fc.assert(fc.property(fc.string().filter((status) => status !== "ok"), fc.dictionary(fc.string(), fc.jsonValue()), (status, rest) => {
      expect(wentThrough({ ...rest, status })).toBe(false)
    }))
  })
})

describe("the name of a panel", () => {
  it("is its title, so the panel is announced and found by what it is", () => {
    const html = render(<Dialog title="研究の変更点" held={{ open: true, close: () => undefined }}><p>x</p></Dialog>)
    const labelledBy = /<dialog[^>]*aria-labelledby="([^"]+)"/.exec(html)?.[1]
    expect(labelledBy).toBeDefined()
    expect(html).toMatch(new RegExp(`<h2[^>]*id="${labelledBy ?? ""}"[^>]*>研究の変更点</h2>`))
  })

  it("is its own for each of several panels on one screen", () => {
    const html = render(
      <>
        <Dialog title="値の編集" held={{ open: true, close: () => undefined }}><p>x</p></Dialog>
        <Dialog title="値の作成" held={{ open: true, close: () => undefined }}><p>y</p></Dialog>
      </>,
    )
    const ids = [...html.matchAll(/<dialog[^>]*aria-labelledby="([^"]+)"/g)].map((match) => match[1])
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})

describe("the foot of a panel", () => {
  const panel = (status?: React.ReactNode) => render(
    <Dialog
      title="値の編集"
      held={{ open: true, close: () => { /* shut from outside */ } }}
      action={() => <button type="submit">保存</button>}
      status={status}
    >
      <p>fields</p>
    </Dialog>,
  )

  it("shows what the save is doing at its left, before the buttons, so they end at the panel's right edge", () => {
    const html = panel(<span>STATUS</span>)
    const foot = html.slice(html.indexOf("justify-end"))
    expect(foot).toMatch(/^justify-end[^"]*"><span class="mr-auto"><span>STATUS<\/span><\/span><button[^>]*>キャンセル<\/button><button type="submit">保存<\/button>/)
  })

  it("has nothing before the buttons where there is nothing to say", () => {
    const html = panel()
    expect(html).not.toContain("mr-auto")
  })
})

/**
 * A panel's title is the kind of thing and the act; which one it acts on is the
 * line under the title, in the words of the table's column.
 */
describe("what a panel acts on", () => {
  const confirm = (subject?: DialogSubject | readonly DialogSubject[]) => render(
    <Confirm
      held={{ open: true, close: () => undefined }}
      title="ファイルの削除"
      subject={subject}
      warning="このファイルが削除されます。元に戻せません。"
      confirm="削除"
      onConfirm={() => undefined}
    />,
  )

  it("names the one it acts on under the title and before the warning, with the column's name", () => {
    const html = confirm({ name: "ファイル名", value: "hum0001.v1.freq.txt.gz" })
    const title = html.indexOf("ファイルの削除")
    const name = html.indexOf("ファイル名")
    const value = html.indexOf("hum0001.v1.freq.txt.gz")
    const warning = html.indexOf("このファイルが削除されます。")
    expect(title).toBeGreaterThan(-1)
    expect(name).toBeGreaterThan(title)
    expect(value).toBeGreaterThan(name)
    expect(warning).toBeGreaterThan(value)
  })

  it("names each of several, in the order given", () => {
    const html = confirm([{ name: "統合元", value: "RNA-seq" }, { name: "統合先", value: "RNA sequencing" }])
    expect(html.indexOf("統合元")).toBeLessThan(html.indexOf("RNA-seq"))
    expect(html.indexOf("RNA-seq")).toBeLessThan(html.indexOf("統合先"))
    expect(html.indexOf("統合先")).toBeLessThan(html.indexOf("RNA sequencing"))
  })

  it("draws no line when there is nothing to name", () => {
    expect(confirm()).not.toContain("ファイル名")
  })
})

describe("a link to a search a crawler is kept off", () => {
  it("has nofollow on a button, the way to more and a condition, and not on a research's page", () => {
    const rels = (html: string) => linksIn(html).map((link) => [link.href, link.rel.includes("nofollow")])

    expect(rels(render(<ButtonLink to="/research/export?q=cancer" external>書き出し</ButtonLink>)))
      .toEqual([["/research/export?q=cancer", true]])
    expect(rels(render(<ButtonLink to="/research?q=cancer">例</ButtonLink>))).toEqual([["/research?q=cancer", true]])
    expect(rels(render(<ButtonLink to="/research/hum0001">研究</ButtonLink>))).toEqual([["/research/hum0001", false]])
    expect(rels(render(<MoreLink to="/en/dataset?q=cancer">more</MoreLink>))).toEqual([["/en/dataset?q=cancer", true]])
    expect(rels(render(<MoreLink to="/news">more</MoreLink>))).toEqual([["/news", false]])
    expect(rels(render(<Chip field="疾患" value="C53" to="/research?q=cancer" remove="外す" />)))
      .toEqual([["/research?q=cancer", true]])
  })
})
