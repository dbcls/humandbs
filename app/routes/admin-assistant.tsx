import { isAssistantRunning } from "~/assistant/proxy.server"
import { requireCapability } from "~/auth/actor.server"
import { Heading, Stack } from "~/components/base"
import { Card, Empty, Page } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { readLocale } from "~/public/urls"

import { AssistantContents } from "./admin-assistant-client"

import type { Route } from "./+types/admin-assistant"

/**
 * The assistant's screen.
 *
 * **The portal owns the address and the frame; the assistant owns what is drawn
 * inside them**. What is here is the frame: the
 * capability the area is reached by, the language, and whether the service is
 * running. The work of reading an application belongs to the service
 * and to the screen that talks to it, which is built with the parts in
 * `app/components/` and reaches the service through
 * `/admin/assistant/api/…` — never by fetching it directly.
 *
 * **The screen does not know the service's address.** Whether it is running
 * is asked of the proxy module, which returns a boolean; a screen that knew the
 * address could call the service without passing the capability check.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireCapability(request, "use-assistant")
  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    running: await isAssistantRunning(),
  }
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.assistant.heading) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminAssistant({ loaderData }: Route.ComponentProps) {
  const { locale, running } = loaderData
  const words = messagesFor(locale).admin.assistant

  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={words.heading} note={words.note} />
          {running ? <AssistantContents locale={locale} /> : <Empty>{words.absent}</Empty>}
        </Stack>
      </Card>
    </Page>
  )
}
