import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { BRANCH_STANDINGS } from "~/admin/listing"
import { messagesFor } from "~/i18n/messages"

import { BranchStandingMark, STANDING_MARK } from "./upstream"

describe("枝番の一覧のポータル側の答え", () => {
  it("3 つの状態は印だけで見分けられる", () => {
    const marks = new Set(BRANCH_STANDINGS.map((standing) => STANDING_MARK[standing]))
    expect(marks.size).toBe(BRANCH_STANDINGS.length)
  })

  it("行に出る語はペインの軸の語と同じで、印は読み上げない", () => {
    const t = messagesFor("ja").admin.templates
    for (const standing of BRANCH_STANDINGS) {
      const html = renderToStaticMarkup(<BranchStandingMark standing={standing} locale="ja" />)
      expect(html).toContain(t.standings[standing])
      expect(html).toContain("aria-hidden=\"true\"")
    }
  })
})
