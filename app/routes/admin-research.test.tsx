import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { AdminResearchPageView } from "~/admin/pages.server"
import { messagesFor } from "~/i18n/messages"

import type { Route } from "./+types/admin-research"
import AdminResearch from "./admin-research"

const t = messagesFor("ja").admin.detail

type Label = AdminResearchPageView["labels"][number]

const OLD: Label = { id: "pin-old", label: "hum0101", isPrimary: false, holdsFiles: false }
const NEW: Label = { id: "pin-new", label: "hum0102", isPrimary: true, holdsFiles: false }

function screen(view: Partial<AdminResearchPageView>): string {
  const loaderData: AdminResearchPageView = {
    locale: "ja",
    researchId: "0f3a0000-0000-4000-8000-000000000001",
    humLabel: "hum0102",
    labels: [NEW, OLD],
    versions: [],
    drafts: [],
    reviews: [],
    fileSummary: { count: 0, bytes: 0 },
    filesRemain: false,
    switching: false,
    ...view,
  }
  const props = { loaderData, actionData: undefined, params: {}, matches: [] } as unknown as Route.ComponentProps
  const Stub = createRoutesStub([{ path: "/*", Component: () => <AdminResearch {...props} /> }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin/research/x"]} />)
}

/**
 * The reason shown over a closed control, or null when the control
 * named `label` is there and can be pressed. Throws when there is no such
 * control, so a test cannot pass by the control going missing.
 */
function reasonOf(html: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const closed = new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>).)*?${escaped}</button><span id="[^"]*" role="tooltip"[^>]*>([^<]*)</span>`)
  const found = closed.exec(html)
  if (found !== null) return found[1] ?? ""
  const open = new RegExp(`<button(?![^>]*disabled="")[^>]*>(?:(?!</button>).)*?${escaped}</button>`)
  if (!open.test(html)) throw new Error(`no control named ${label}`)
  return null
}

/** The ID list's row of one label. */
function rowOf(html: string, label: string): string {
  const row = html.split("<li").slice(1).map((part) => part.split("</li>")[0] ?? "").find((part) => part.includes(`>${label}<`))
  if (row === undefined) throw new Error(`no row for ${label}`)
  return row
}

describe("研究の削除", () => {
  it("ファイルが残っていれば押せず、理由とファイル一覧から削除する経路を示す", () => {
    const html = screen({ filesRemain: true })
    expect(reasonOf(html, t.deleteResearch)).toBe(t.deleteResearchFilesRemain)
    expect(t.deleteResearchFilesRemain).toContain(`「${t.openFiles}」`)
    expect(html).toContain(t.openFiles)
  })

  it("ファイルが無ければ押せる", () => {
    expect(reasonOf(screen({ filesRemain: false }), t.deleteResearch)).toBeNull()
  })

  it("ストアが応答せず分からないときは押せるまま (押した先のエラーメッセージに任せる)", () => {
    expect(reasonOf(screen({ filesRemain: null, fileSummary: null }), t.deleteResearch)).toBeNull()
  })
})

describe("研究 ID の解除", () => {
  it("何も残らず何も動いていなければ、どちらの ID も解除できる", () => {
    const html = screen({})
    expect(reasonOf(rowOf(html, "hum0101"), t.unpin)).toBeNull()
    expect(reasonOf(rowOf(html, "hum0102"), t.unpin)).toBeNull()
    expect(html).not.toContain(t.movingFiles)
  })

  it("primary のフォルダに公開中のファイルがあれば押せず、別の ID を primary にするよう示す", () => {
    const html = screen({ labels: [{ ...NEW, holdsFiles: true }, OLD] })
    expect(reasonOf(rowOf(html, "hum0102"), t.unpin)).toBe(t.unpinHeld["holds-files"])
    expect(t.unpinHeld["holds-files"]).toContain("別の ID を primary に")
    expect(reasonOf(rowOf(html, "hum0101"), t.unpin)).toBeNull()
  })

  it("付け替えの途中は、古い ID に移動中のバッジが表示され、解除は移動の終わりを待つよう示す", () => {
    const html = screen({ labels: [NEW, { ...OLD, holdsFiles: true }], switching: true })
    const old = rowOf(html, "hum0101")
    expect(old).toContain(t.movingFiles)
    expect(reasonOf(old, t.unpin)).toBe(t.unpinHeld.moving)
    // The new primary's folder is empty, but a switch running may still land a file in it.
    expect(reasonOf(rowOf(html, "hum0102"), t.unpin)).toBe(t.unpinHeld.switching)
    expect(rowOf(html, "hum0102")).not.toContain(t.movingFiles)
  })

  it("古い ID のフォルダに残ったファイルを動かすものが無ければ、バッジは表示せず、移し直す手順を示す", () => {
    const html = screen({ labels: [NEW, { ...OLD, holdsFiles: true }] })
    const old = rowOf(html, "hum0101")
    expect(old).not.toContain(t.movingFiles)
    expect(reasonOf(old, t.unpin)).toBe(t.unpinHeld["left-behind"])
  })

  it("フォルダが分からないときは、切り替えが無ければ押せるまま", () => {
    const html = screen({ labels: [{ ...NEW, holdsFiles: null }, { ...OLD, holdsFiles: null }], fileSummary: null, filesRemain: null })
    expect(reasonOf(rowOf(html, "hum0101"), t.unpin)).toBeNull()
    expect(reasonOf(rowOf(html, "hum0102"), t.unpin)).toBeNull()
  })

  it("付け替えの 2 つの経路 (ID の割り当てと primary への変更) が画面にある", () => {
    const html = screen({})
    expect(html).toContain(t.addLabel)
    expect(reasonOf(rowOf(html, "hum0101"), t.makePrimary)).toBeNull()
    expect(rowOf(html, "hum0102")).not.toContain(t.makePrimary)
  })
})
