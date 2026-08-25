import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useRouteLoaderData,
} from "react-router"

import { isAdminPath } from "~/admin/urls"
import { readActor } from "~/auth/actor.server"
import { AdminDrawer } from "~/components/admin"
import { Announcements, SiteFooter, SiteHeader } from "~/components/layout"
import { Page } from "~/components/page"
import { startFileRunner } from "~/files/runner.server"
import { DEFAULT_LOCALE } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { activeAlerts } from "~/public/site.server"
import { readLocale } from "~/public/urls"
import { startUpstreamRunner } from "~/upstream/runner.server"

import type { Route } from "./+types/root"

import "./app.css"

/**
 * The language is read from the address rather than from a header or a cookie,
 * so a page has one language whoever asks for it and a link can name the
 * language it points at.
 *
 * The banner is loaded here because it belongs to every page. It is one small
 * read, and asking each loader for it instead would mean a page that forgot it
 * silently stops announcing. The header's account area is here for the same
 * reason; a request with no session cookie asks the database nothing at all.
 *
 * **Only the name and whether the person is an administrator leave the server.**
 * Capabilities are derived per request where they are checked, and putting them
 * in a loader's answer would send an authorisation decision to the browser.
 *
 * The two background loops — the one that moves files between the buckets, and
 * the one that refreshes the upstream caches — are started from here because
 * every request passes through: they belong to the process rather than to a
 * screen, and starting one again while it runs does nothing.
 */
export async function loader({ request }: Route.LoaderArgs) {
  startFileRunner()
  startUpstreamRunner()
  const locale = readLocale(new URL(request.url).pathname).locale
  const actor = await readActor(request)
  return {
    locale,
    alerts: await activeAlerts(locale),
    account: actor === null ? null : { name: actor.name, isAdmin: actor.isAdmin },
  }
}

/**
 * The site's own marks, served from `public/` and carried over from v1 as they
 * are — a favicon is the one thing a reader recognises in a row of tabs, so
 * changing it would be changing the site rather than rebuilding it.
 */
export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "icon", href: "/favicon-192x192.png", type: "image/png", sizes: "192x192" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" },
]

export function Layout({ children }: { children: React.ReactNode }) {
  // The layout also wraps the error boundary, which renders when the loader
  // above did not run.
  const data = useRouteLoaderData<typeof loader>("root")
  const locale = data?.locale ?? DEFAULT_LOCALE
  /**
   * **The management area wears a different frame**, and which one is read from
   * the address rather than from the route that matched: this sits above the
   * route tree and is drawn for the error boundary too, where no loader has
   * run. What it drops is what the portal says to its readers — the global
   * navigation, the notices and the sitemap — none of which is addressed to
   * somebody who came here to edit, and which together take 550px of every
   * screen's height before any of its own content begins.
   *
   * **The address alone is not enough.** Every screen under `/admin` demands a
   * session, but an address under it that matches no screen falls through to
   * the catch-all and answers 404 without one — so the frame and its
   * destinations would be drawn for anybody who typed a wrong address. Reading
   * the account as well means a stranger gets the portal's own 404, with the
   * navigation that lets them leave it.
   */
  const { path } = readLocale(useLocation().pathname)
  const managing = isAdminPath(path) && data?.account?.isAdmin === true

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      {/*
        The page sits on a tint, so that the white boxes a screen is built from
        read as boxes rather than as the page itself. The portal's own
        photograph is multiplied into that tint and drawn once, at the width of
        the window, without repeating.

        **It hangs from the top of the document, not from the top of the page.**
        The bar and the notices are opaque and cover their part of it, which is
        what puts the photograph's subject where a reader meets it — the same
        place v1 has it, and v1 sets it on the body for the same reason. Hung
        below them instead it moves with however many notices are up that day.
      */}
      {/*
        **The photograph is the portal's, and a management screen does not wear
        it.** It is the subject a reader meets on the way in; under a table of
        397 rows it is texture behind text and nothing else.
      */}
      <body
        className={`flex min-h-screen flex-col bg-surface ${
          managing ? "" : "bg-[url(/bg.jpg)] bg-[length:100%_auto] bg-top bg-no-repeat bg-blend-multiply"
        }`}
      >
        <SiteHeader locale={locale} account={data?.account ?? null} managing={managing} />
        {!managing && <Announcements alerts={data?.alerts ?? []} locale={locale} />}
        {managing && <AdminDrawer locale={locale} path={path} />}
        <div className="flex-1">
          {children}
        </div>
        {!managing && <SiteFooter locale={locale} />}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const locale = useRouteLoaderData<typeof loader>("root")?.locale ?? DEFAULT_LOCALE
  const messages = messagesFor(locale)

  let title = messages.notFoundTitle
  let detail = messages.notFoundBody
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    if (error.status !== 404) {
      title = String(error.status)
      detail = error.statusText
    }
  } else if (import.meta.env.DEV && error instanceof Error) {
    title = error.name
    detail = error.message
    stack = error.stack
  }

  return (
    <Page>
      <h1 className="font-bold text-2xl">{title}</h1>
      <p className="mt-2">{detail}</p>
      {stack !== undefined && (
        <pre className="mt-6 w-full overflow-x-auto bg-surface p-4 text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </Page>
  )
}
