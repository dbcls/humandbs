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
import { DEFAULT_LOCALE } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { activeAlerts } from "~/public/site.server"
import { readLocale } from "~/public/urls"

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
 */
export async function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const actor = await readActor(request)
  return {
    locale,
    alerts: await activeAlerts(locale),
    account: actor === null ? null : { name: actor.name, isAdmin: actor.isAdmin },
  }
}

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
        <div className="flex-1">{children}</div>
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
