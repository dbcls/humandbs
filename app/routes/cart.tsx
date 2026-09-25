import { useEffect, useRef } from "react"
import { useFetcher } from "react-router"

import { APPLICATION_FORM_URL, applicationPayload, useCart } from "~/cart/store"
import { Button, ButtonLink, CopyButton, Collapsible, Heading, IconButton, Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import { AccessTypeBadge, Card, Crumbs, IdWithIcon, Page, Table, Td } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { windowTitle } from "~/i18n/title"
import { cartPath, datasetPath, href, readLocale, researchPath } from "~/public/urls"

import type { Route } from "./+types/cart"
import type { loader as rowsLoader } from "./cart-rows"

/**
 * The datasets a reader has collected, and the block of JSON that has them
 * into the application system.
 *
 * **The cart is in the browser, and the browser is what requests the rows.**
 * The collection used to ride in the address so that this loader could draw the
 * table from it — which put a hundred accessions in the address bar for what is
 * a private, half-finished errand. The page is `/cart` and nothing else now,
 * and the accessions go out in a request nobody sees (`cart-rows.ts`).
 *
 * **What is on screen follows the cart.** Taking a row out has to remove it at
 * once: the JSON below the table is what gets pasted into an application, and
 * it may not name something the reader has just removed. So the table is drawn
 * from the cart and the fetched rows only fill it in.
 */
export function loader({ request }: Route.LoaderArgs) {
  return { locale: readLocale(new URL(request.url).pathname).locale }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: windowTitle(messages, [messages.cart.heading]) }]
}

export default function Cart({ loaderData }: Route.ComponentProps) {
  const { locale } = loaderData
  const messages = messagesFor(locale)
  const cart = useCart()
  const fetcher = useFetcher<typeof rowsLoader>()
  const shown = cart.ids
  const held = shown.join(",")

  // **Asked for once per collection, not once per render.** The fetcher is
  // reached for by effect rather than by event because the cart can also be
  // changed from the bar above this page, and an empty cart is not asked about
  // at all — there is nothing to draw and the table is not on screen.
  const sent = useRef<string | null>(null)
  useEffect(() => {
    if (held === sent.current) return
    sent.current = held
    if (held !== "") void fetcher.load(`${href(locale, `${cartPath()}/rows`)}?ids=${held}`)
  }, [held, locale, fetcher])

  const answered = fetcher.data
  const rowOf = new Map((answered?.rows ?? []).map((row) => [row.label, row]))
  const payload = applicationPayload(shown)

  return (
    <Page width="reading">
      <Crumbs locale={locale} current={messages.cart.heading} />
      <Card under={false}>
        {/*
          **The collection and the errand are two things in one box**, not two
          parts of a page: the table ends and the first step is what to do with
          what it holds. **The numbering is what groups the steps** — the list
          says "first this, then that" on its own, so the distance above it does
          not have to show it a second time by standing further off.
        */}
        <Stack gap="normal">
          {/*
            **How many, and the one thing that acts on all of them, at the end
            of the line the title opens.** The two belong together — the number
            is what "remove all" would remove — and the heading's own row is
            where the site already remains what acts on a whole page.

            **Not the count slot beside the title**, which would put the number
            at the left with the errand 1,024px away from it. The row centres
            what it holds rather than sitting it on the title's baseline: a
            36px control and a 14px word have no shared baseline, and the small
            one comes out 5.7px low.

            **Emptying is not asked about**: the notice it raises holds the way
            back (`cart/store.ts`).
          */}
          <Heading title={messages.cart.heading}>
            <span className="text-ink-muted">{messages.search.results(shown.length)}</span>
            {shown.length > 0 && (
              <Button
                type="button"
                size="sm"
                icon={<Icon name="close" />}
                onClick={() => {
                  cart.remove(shown)
                }}
              >
                {messages.cart.clear}
              </Button>
            )}
          </Heading>

          {/*
          **The rows are one line each, so the cells are centred.** `Td` sits
          its contents at the top, which is right where a cell may run to three
          or four lines; here it leaves an indicator 36px tall and a word 22.4px tall
          starting at the same edge, and nothing lines up with anything.
        */}
          <Table
            align="middle"
            whenEmpty={messages.cart.emptyRow}
            actions={messages.cart.remove}
            headers={[
              messages.dataset.datasetId,
              messages.research.researchId,
              messages.dataset.accessType,
            ]}
          >
            {shown.map((label) => {
              const row = rowOf.get(label)
              return (
                <tr key={label}>
                  <Td nowrap>
                    <IdWithIcon kind="dataset" to={row === undefined ? null : href(locale, datasetPath(label))}>
                      {label}
                    </IdWithIcon>
                  </Td>
                  {row === undefined
                    ? (
                        <Td className="text-ink-muted text-sm" colSpan={2}>
                          {/* Only what the server has actually looked
                                    for can be reported as missing; a row just
                                    added is simply not fetched yet. */}
                          {answered?.asked.includes(label) === true
                            ? messages.cart.missing
                            : ""}
                        </Td>
                      )
                    : (
                        <>
                          <Td nowrap>
                            <IdWithIcon kind="research" to={href(locale, researchPath(row.humLabel))}>
                              {row.humLabel}
                            </IdWithIcon>
                          </Td>
                          <Td>
                            {row.accessType !== null && (
                              <AccessTypeBadge term={row.accessType} />
                            )}
                          </Td>
                        </>
                      )}
                  <Td holds="icon">
                    <IconButton
                      name="close"
                      label={messages.cart.removeOne(label)}
                      onClick={() => { cart.remove([label]) }}
                    />
                  </Td>
                </tr>
              )
            })}
          </Table>

          {shown.length > 0 && <ApplicationSteps payload={payload} locale={locale} />}
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * What to do with the collection, as the two steps it is.
 *
 * **A procedure is not a remark.** The three clauses used to sit in the ⓘ box
 * the site uses for asides, above two buttons that carried them out — so the
 * words and the controls were the same instruction told twice, and the box said
 * "by the way" about the only thing this screen is for. **Each step has its
 * own control instead**, and the numbering is the list's own (`<ol>`), which is
 * what conveys "first this, then that" to a reader who cannot see the layout.
 *
 * **The second step opens a new tab**, which the words beside it say rather than
 * the indicator alone (`base.tsx` の `ButtonLink`).
 */
function ApplicationSteps({ payload, locale }: { payload: string, locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <ol
      aria-label={messages.cart.steps}
      className="flex list-decimal flex-col gap-4 pl-5 marker:font-semibold marker:text-brand"
    >
      <li>
        <Stack gap="tight">
          <span>{messages.cart.stepCopy}</span>
          <div className="flex flex-wrap items-center gap-3">
            <CopyButton text={payload} label={messages.cart.copy} done={messages.copied} />
          </div>
          {/*
            The JSON is what the button copies, not something to read — it is
            collapsed away, and focusable when opened because it scrolls (a hundred
            datasets are four hundred lines, and a box only a mouse can scroll is
            a box some readers cannot reach).
          */}
          <Collapsible summary={messages.cart.showPayload}>
            <pre
              tabIndex={0}
              aria-label={messages.cart.payload}
              className="max-h-96 overflow-auto rounded border border-line bg-surface p-4 text-xs"
            >
              <code>{payload}</code>
            </pre>
          </Collapsible>
        </Stack>
      </li>
      <li>
        <Stack gap="tight">
          <span>{messages.cart.stepApply}</span>
          <div>
            {/*
              Brand rather than accent: the site colours its two halves, and
              applying to use data is the same errand as the blue buttons on
              「データの利用」. Accent here would make the cart look like part of
              the other half.
            */}
            <ButtonLink
              to={APPLICATION_FORM_URL}
              external
              newTab
              newTabLabel={messages.newTab}
              variant="primary"
            >
              {messages.cart.apply}
            </ButtonLink>
          </div>
        </Stack>
      </li>
    </ol>
  )
}
