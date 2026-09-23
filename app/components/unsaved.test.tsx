import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { anyUnsaved, holdUnsaved, LeaveGuard } from "./unsaved"

describe("what holds unsent work", () => {
  it("is empty until something holds, and empty again once everything lets go", () => {
    expect(anyUnsaved()).toBe(false)
    holdUnsaved("one", true)
    expect(anyUnsaved()).toBe(true)
    holdUnsaved("two", true)
    holdUnsaved("one", false)
    expect(anyUnsaved()).toBe(true)
    holdUnsaved("two", false)
    expect(anyUnsaved()).toBe(false)
  })

  it("is not disturbed by something letting go that never held, or holding twice", () => {
    holdUnsaved("never", false)
    expect(anyUnsaved()).toBe(false)
    holdUnsaved("twice", true)
    holdUnsaved("twice", true)
    holdUnsaved("twice", false)
    expect(anyUnsaved()).toBe(false)
  })
})

describe("the guard at the way off the screen", () => {
  it("draws nothing while no way off has been taken", () => {
    const Stub = createRoutesStub([{ path: "/*", Component: () => <LeaveGuard /> }])
    const html = renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
    expect(html).not.toContain("未保存の変更")
    expect(html).not.toContain("保存せずに移動")
  })
})
