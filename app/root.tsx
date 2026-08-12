import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router"

import { readActor } from "~/auth/actor.server"
import { SiteFooter, SiteHeader } from "~/components/layout"
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

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-screen flex-col">
        <SiteHeader locale={locale} alerts={data?.alerts ?? []} account={data?.account ?? null} />
        {/*
          The page sits on a tint, so that the white boxes a screen is built
          from read as boxes rather than as the page itself. The portal's own
          photograph is multiplied into that tint at the top of the page, which
          is where v1 puts it — it is the site's backdrop and never the
          background of anything anybody has to read, because the boxes cover
          it. It is drawn once, at the width of the window, and does not repeat.
        */}
        <div className="flex-1 bg-surface bg-[url(/bg.jpg)] bg-[length:100%_auto] bg-top bg-no-repeat bg-blend-multiply">
          {children}
        </div>
        <SiteFooter locale={locale} />
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
