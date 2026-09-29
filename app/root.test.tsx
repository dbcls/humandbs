import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { ErrorBoundary } from "./root"

/**
 * A route error response, matched by `isRouteErrorResponse`'s own duck-typed
 * check (`status`, `statusText`, `internal`, `data`) rather than by react-router's
 * own class for one, which the public API does not export.
 */
function routeErrorResponse(status: number): unknown {
  return { status, statusText: "", internal: false, data: null }
}

function render(error: unknown, locale: Locale = "ja"): string {
  const Stub = createRoutesStub([
    { path: "/", id: "root", Component: () => null, ErrorBoundary },
  ])
  return renderToStaticMarkup(
    <Stub
      initialEntries={["/"]}
      hydrationData={{ loaderData: { root: { locale } }, errors: { root: error } }}
    />,
  )
}

function heading(html: string): string {
  const found = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)
  if (found === null) throw new Error("見出しが無い")
  return found[1] ?? ""
}

describe("root の ErrorBoundary", () => {
  it("404 の route error response は見つからない旨を表示する", () => {
    const html = render(routeErrorResponse(404))
    const messages = messagesFor("ja")
    expect(heading(html)).toBe(messages.notFoundTitle)
    expect(html).toContain(messages.notFoundBody)
  })

  it("403 の route error response は権限が無い旨を表示し、時間をおいて試すようには案内しない", () => {
    const html = render(routeErrorResponse(403))
    const messages = messagesFor("ja")
    expect(heading(html)).toBe(messages.forbiddenTitle)
    expect(html).toContain(messages.forbiddenBody)
    expect(html).not.toContain(messages.errorBody)
  })

  it("403 と 404 以外の route error response はエラーの文言を表示する", () => {
    fc.assert(fc.property(
      fc.integer({ min: 400, max: 599 }).filter((status) => status !== 403 && status !== 404),
      (status) => {
        const html = render(routeErrorResponse(status))
        const messages = messagesFor("ja")
        expect(heading(html)).toBe(messages.errorTitle)
        expect(html).toContain(messages.errorBody)
      },
    ))
  })

  it("route の外の例外は、開発中でなければエラーの文言を表示する", () => {
    vi.stubEnv("DEV", false)
    try {
      const html = render(new Error("boom"))
      const messages = messagesFor("ja")
      expect(heading(html)).toBe(messages.errorTitle)
      expect(html).toContain(messages.errorBody)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("route の外の例外は、開発中は例外の名前とメッセージを表示する", () => {
    const html = render(new Error("boom"))
    expect(heading(html)).toBe("Error")
    expect(html).toContain("boom")
  })

  it("英語では英語の文言で表示する", () => {
    const html = render(routeErrorResponse(404), "en")
    expect(heading(html)).toBe(messagesFor("en").notFoundTitle)
  })

  it("英語では 403 も英語の文言で表示する", () => {
    const html = render(routeErrorResponse(403), "en")
    expect(heading(html)).toBe(messagesFor("en").forbiddenTitle)
    expect(html).toContain(messagesFor("en").forbiddenBody)
  })
})
