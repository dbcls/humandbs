import { requireCapability } from "~/auth/actor.server"
import { Card, Empty, Page, PageHead } from "~/components/page"
import { loadConfig } from "~/config.server"
import { messagesFor } from "~/i18n/messages"
import { readLocale } from "~/public/urls"

import { AssistantWorkspace } from "./admin-assistant-client"

import type { Route } from "./+types/admin-assistant"

/**
 * The assistant's screen.
 *
 * **The portal owns the address and the frame; the assistant owns what is drawn
 * inside them** (`docs/assistant.md`). What is here is the frame: the
 * capability the area is reached by, the language, and whether the service is
 * deployed at all. The work of reading an application belongs to the service
 * and to the screen that talks to it, which is built with the parts in
 * `app/components/` and reaches the service through
 * `/admin/assistant/api/…` — never by fetching it directly.
 *
 * **A screen may not read `assistantOrigin` for anything but this.** The
 * address of the service is the proxy's business; a screen that knew it could
 * call it without passing the capability check.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireCapability(request, "use-assistant")
  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    deployed: loadConfig(process.env).assistantOrigin !== null,
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.assistant.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminAssistant({ loaderData }: Route.ComponentProps) {
  const { locale, deployed } = loaderData
  const words = messagesFor(locale).admin.assistant

  return (
    <Page>
      <PageHead label={words.heading} />
      {deployed ? <AssistantWorkspace locale={locale} /> : <Card><Empty>{words.absent}</Empty></Card>}
    </Page>
  )
}
