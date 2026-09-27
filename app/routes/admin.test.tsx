import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { EVENT_ACTIONS, type EventListing } from "~/admin/events"
import { messagesFor } from "~/i18n/messages"

import type { Route } from "./+types/admin"
import Admin from "./admin"

const t = messagesFor("ja").admin.events

function events(over: Partial<EventListing> = {}): EventListing {
  const counts = Object.fromEntries(EVENT_ACTIONS.map((one) => [one, 0])) as EventListing["counts"]
  return {
    actions: [],
    actors: [],
    from: null,
    to: null,
    rows: [],
    counts: { ...counts, "grant-admin": 17 },
    actorOptions: [],
    size: 20,
    total: 17,
    page: 1,
    pageCount: 1,
    rangeFrom: 1,
    rangeTo: 17,
    ...over,
  }
}

function screen(listing: EventListing): string {
  const loaderData = {
    locale: "ja",
    sub: null,
    me: "me",
    upstream: [],
    events: listing,
    admins: [],
    invitations: [],
    version: null,
  }
  const props = { loaderData, actionData: undefined, params: {}, matches: [] } as unknown as Route.ComponentProps
  const Stub = createRoutesStub([{ path: "/*", Component: () => <Admin {...props} /> }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
}

describe("トップの操作の記録", () => {
  it("操作の種類は、0 件のものも含めて全部を絞り込みに並べる", () => {
    const html = screen(events())
    for (const one of EVENT_ACTIONS) {
      expect(html, one).toContain(`value="${one}"`)
      expect(html).toContain(t.actions[one])
    }
  })
})
