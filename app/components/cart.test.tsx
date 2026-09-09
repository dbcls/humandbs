import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { Locale } from "~/i18n/locale"

import { CartMenu } from "./cart"

/**
 * The cart lives in the browser, so what is reachable here is the panel as the
 * server draws it — which is the empty one, and the one every reader meets
 * first. What it looks like holding something is `tests/e2e/cart.spec.ts`.
 */
function panel(locale: Locale, at: string): string {
  const Stub = createRoutesStub([{ path: "*", Component: () => <CartMenu locale={locale} /> }])
  return renderToStaticMarkup(<Stub initialEntries={[at]} />)
}

describe("ヘッダのカート", () => {
  it("何も入っていなくても、カートの画面への道を持つ", () => {
    const html = panel("ja", "/research")
    expect(html).toContain("カートは空です")
    expect(html).toContain("href=\"/cart\"")
    expect(html).toContain("カートを見る")
  })

  it("何も入っていなければ、行に効く「すべて外す」は出さない", () => {
    expect(panel("ja", "/research")).not.toContain("すべて外す")
  })

  it("英語の読者は英語の面から、/en の下のカートへ行く", () => {
    const html = panel("en", "/en/research")
    expect(html).toContain("href=\"/en/cart\"")
    expect(html).toContain("Go to the cart")
  })
})
