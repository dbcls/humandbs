import { redirect } from "react-router"

import { adminPath } from "~/admin/urls"
import { requireActor } from "~/auth/actor.server"
import { acceptInvitation } from "~/auth/invitations.server"
import { ButtonLink, Heading, Note, Stack } from "~/components/base"
import { Card, Page } from "~/components/page"
import { getDb } from "~/db/client.server"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-invite"

/**
 * Where an invitation link lands.
 *
 * **Opening it signed in is accepting it** (`auth/invitations.server.ts`). The
 * area's layout sends anybody without a session to sign in and back here, so a
 * link preview never gets this far, and the person it was sent to has nothing
 * to press.
 *
 * **Becoming an administrator goes straight on to the front page.** This page
 * is drawn with the frame of whoever opened it, and in the request that made
 * them an administrator they were not one yet — so it would stand in the
 * public frame. The front page draws the management one, with their own row
 * in the list of administrators. Every other outcome stays here to say why
 * nothing happened, the link being left for somebody else included.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await requireActor(request)
  const locale = readLocale(new URL(request.url).pathname).locale
  const outcome = await acceptInvitation(getDb(), params.token, { sub: actor.sub, name: actor.name })
  if (outcome === "granted") throw redirect(href(locale, adminPath()))
  return { locale, outcome }
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.admins.invited.heading) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminInvite({ loaderData }: Route.ComponentProps) {
  const { locale, outcome } = loaderData
  const t = messagesFor(locale).admin.admins.invited
  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} />
          <Note kind={outcome === "already" ? "done" : "warning"}>{t[outcome]}</Note>
          <div>
            <ButtonLink to={href(locale, adminPath())} chevron>{t.toTop}</ButtonLink>
          </div>
        </Stack>
      </Card>
    </Page>
  )
}
