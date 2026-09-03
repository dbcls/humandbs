import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"

import { APPLICATION_FORM_URL, applicationPayload, useCart } from "~/cart/store"
import { useHydrated } from "~/hydrated"
import { Button, ButtonLink, Fold, Heading, IconButton, Note, Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import { AccessTypeBadge, Card, Crumbs, Empty, Page, Table, Td } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { cartRows } from "~/public/lists.server"
import { datasetPath, href, readLocale, researchPath } from "~/public/urls"

import type { Route } from "./+types/cart"

/**
 * The datasets a reader has collected, and the block of JSON that carries them
 * into the application system.
 *
 * **The cart is in the browser and the rows come from the server**, so the
 * address carries the collection: the page reads `?ids=`, and the browser
 * writes what it is holding back into it. **That is a way of rendering, not a
 * way of sharing** — the browser's cart always wins, so an address somebody
 * else sends is overwritten the moment it is opened.
 *
 * **What is on screen follows the cart, not the address.** Taking a row out has
 * to remove it at once: the JSON below the table is what gets pasted into an
 * application, and it may not name something the reader has just removed.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const locale = readLocale(url.pathname).locale
  const asked = (url.searchParams.get("ids") ?? "").split(",").filter((id) => id !== "")
  return { locale, asked, rows: await cartRows(asked, locale) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: `${messages.cart.heading} - ${messages.siteName}` }]
}

export default function Cart({ loaderData }: Route.ComponentProps) {
  const { locale, rows, asked } = loaderData
  const messages = messagesFor(locale)
  const cart = useCart()
  const hydrated = useHydrated()
  const [params, setParams] = useSearchParams()

  // Until the page is running, the address is all there is to draw from.
  const shown = hydrated ? cart.ids : asked
  const held = shown.join(",")

  // The browser is the one that knows what is in the cart; the address is a
  // copy of it, replaced rather than pushed so that Back leaves the cart.
  useEffect(() => {
    if (!hydrated || (params.get("ids") ?? "") === held) return
    setParams(held === "" ? {} : { ids: held }, { replace: true })
  }, [hydrated, held, params, setParams])

  const rowOf = new Map(rows.map((row) => [row.label, row]))
  const payload = applicationPayload(shown)

  return (
    <Page width="reading">
      <Crumbs locale={locale} current={messages.cart.heading} />
      <Card under={false}>
        <Stack gap="normal">
          <Heading title={messages.cart.heading} count={messages.search.results(shown.length)} />

          {shown.length === 0
            ? (
                <Stack gap="tight">
                  <Empty>{messages.cart.empty}</Empty>
                  <p className="text-ink-muted text-sm">{messages.cart.emptyHint}</p>
                </Stack>
              )
            : (
                <Stack gap="normal">
                  <Note>{messages.cart.instructions}</Note>

                  <Table headers={[
                    messages.dataset.datasetId,
                    messages.research.researchId,
                    messages.dataset.accessType,
                    <span key="remove" className="sr-only">{messages.cart.remove}</span>,
                  ]}
                  >
                    {shown.map((label) => {
                      const row = rowOf.get(label)
                      return (
                        <tr key={label}>
                          <Td nowrap>
                            <Icon
                              name="database"
                              aria-hidden="true"
                              className="mr-1 text-ink-muted"
                            />
                            {row === undefined
                              ? label
                              : <Link to={href(locale, datasetPath(label))}>{label}</Link>}
                          </Td>
                          {row === undefined
                            ? (
                                <Td className="text-ink-muted text-sm" colSpan={2}>
                                  {/* Only what the server has actually looked
                                      for can be reported as missing; a row just
                                      added is simply not fetched yet. */}
                                  {asked.includes(label) ? messages.cart.missing : ""}
                                </Td>
                              )
                            : (
                                <>
                                  <Td nowrap>
                                    <Icon
                                      name="book"
                                      aria-hidden="true"
                                      className="mr-1 text-ink-muted"
                                    />
                                    <Link to={href(locale, researchPath(row.humLabel))}>
                                      {row.humLabel}
                                    </Link>
                                  </Td>
                                  <Td>
                                    {row.accessType !== null && (
                                      <AccessTypeBadge term={row.accessType} />
                                    )}
                                  </Td>
                                </>
                              )}
                          <Td narrow>
                            <IconButton
                              name="trash"
                              label={messages.cart.removeOne(label)}
                              onClick={() => { cart.remove([label]) }}
                            />
                          </Td>
                        </tr>
                      )
                    })}
                  </Table>

                  <div className="flex flex-wrap items-center gap-3">
                    <CopyPayload payload={payload} locale={locale} />
                    {/*
                      Brand rather than accent: the site colours its two halves,
                      and applying to use data is the same errand as the blue
                      buttons on 「データの利用」. Accent here would make the cart
                      look like part of the other half.
                    */}
                    <ButtonLink
                      to={APPLICATION_FORM_URL}
                      external
                      newTab
                      variant="primary"
                      pill
                      icon={<Icon name="external" />}
                    >
                      {messages.cart.apply}
                    </ButtonLink>
                  </div>

                  {/*
                    The JSON is what the button copies, not something to read —
                    it is folded away, and focusable when opened because it
                    scrolls (a hundred datasets are four hundred lines, and a box
                    only a mouse can scroll is a box some readers cannot reach).
                  */}
                  <Fold summary={messages.cart.showPayload}>
                    <pre
                      tabIndex={0}
                      aria-label={messages.cart.payload}
                      className="max-h-96 overflow-auto rounded border border-line bg-surface p-4 text-xs"
                    >
                      <code>{payload}</code>
                    </pre>
                  </Fold>
                </Stack>
              )}
        </Stack>
      </Card>
    </Page>
  )
}

function CopyPayload({ payload, locale }: { payload: string, locale: Locale }) {
  const messages = messagesFor(locale)
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      pill
      icon={<Icon name="copy" />}
      onClick={() => {
        void navigator.clipboard.writeText(payload).then(() => {
          setCopied(true)
          window.setTimeout(() => {
            setCopied(false)
          }, 2000)
        })
      }}
    >
      {copied ? messages.cart.copied : messages.cart.copy}
    </Button>
  )
}
