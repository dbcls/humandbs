import { Page } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/home"

export function loader({ request }: Route.LoaderArgs) {
  return { locale: readLocale(new URL(request.url).pathname).locale }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: messagesFor(loaderData.locale).siteName }]
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <Page>
      <h1 className="font-bold text-2xl">{messagesFor(loaderData.locale).siteName}</h1>
    </Page>
  )
}
