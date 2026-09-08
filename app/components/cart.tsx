import { useEffect, useState } from "react"

import type { CartNotice } from "~/cart/store"
import { cartPressGathers, isCartable, useCart, useCartNotice } from "~/cart/store"
import { Button, ButtonLink, IconButton, Menu, Note, Toast } from "~/components/base"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import type { Messages } from "~/i18n/messages"
import { messagesFor } from "~/i18n/messages"
import { cartPath, href } from "~/public/urls"

/**
 * The cart mark a listing row and the dataset page carry.
 *
 * **One control puts a whole row in or takes it out.** A research row stands
 * for every JGA dataset under it and the dataset page for one — the difference
 * between them is only which accessions they name, so they are the same
 * control.
 *
 * **No mark stands for a whole page.** One did, and a press on it moved 69
 * datasets — 23 times what a row moves at its median — through a glyph drawn
 * exactly like the row's, told apart only by the colour the band gives it.
 *
 * A row whose datasets cannot be applied for shows nothing at all rather than a
 * disabled mark: an unrestricted-access dataset needs no application, and a
 * control that can never do anything is noise in every row of the table.
 *
 * The cart lives in the browser, so on the server every mark draws as "not in
 * the cart" and corrects itself once the page is running. That is why the state
 * is announced (`aria-pressed`) rather than only coloured.
 */
export function CartToggle({ ids, locale }: {
  ids: string[]
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const cart = useCart()
  const cartable = [...new Set(ids.filter(isCartable))]
  const held = cartable.filter((id) => cart.holds(id))

  if (cartable.length === 0) return null
  // **Partly in the cart is its own state.** A research with twenty datasets of
  // which nineteen are collected is not "not collected", and saying so would
  // make the control read as untouched.
  const state = held.length === 0 ? false : held.length === cartable.length ? true : "mixed"
  return (
    <IconButton
      name="cart"
      pressed={state}
      label={messages.cart.toggleRow}
      // Asked when the mark is pressed rather than when it is drawn: a page
      // holds a hundred of these and only one of them is ever pressed.
      onClick={() => {
        if (cartPressGathers(cart.ids, cartable)) cart.add(cartable)
        else cart.remove(cartable)
      }}
    />
  )
}

/**
 * The empty square that holds the cart column open.
 *
 * **The column keeps its width where nothing in it can be pressed.** The
 * dataset listing is mostly archive accessions, so whole pages of it carry no
 * mark at all, and a column that shrank to its own padding there would move
 * every other column sideways as the reader turned the page. The header holds
 * it open; the rows stay empty, because a mark that can never do anything is
 * noise in every one of them.
 *
 * The name is here rather than nowhere because a column of controls with no
 * heading is a column somebody reading the table aloud cannot introduce.
 */
export function CartColumnHead({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <span className="block size-tap">
      <span className="sr-only">{messages.cart.column}</span>
    </span>
  )
}

/**
 * The same thing said in words, for the dataset's own page — there is one
 * dataset there and room to name the action.
 *
 * It sits on the page's band, so neither state may use a page colour: `ghost`
 * would leave brand text on the deep fill at 1.2:1. Collected is a white
 * button, not collected is the accent one.
 */
export function AddToCartButton({ datasetLabel, locale }: {
  datasetLabel: string
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const cart = useCart()
  const held = cart.ids.includes(datasetLabel)

  if (!isCartable(datasetLabel)) return null
  return (
    <Button
      type="button"
      onBand
      variant={held ? "secondary" : "primary"}
      icon={<Icon name={held ? "check" : "cart"} />}
      onClick={() => {
        if (held) cart.remove([datasetLabel])
        else cart.add([datasetLabel])
      }}
    >
      {held ? messages.cart.added : messages.cart.add}
    </Button>
  )
}

/** What the last press did, in one sentence. */
function noticeSentence(notice: CartNotice, messages: Messages): string {
  if (notice.kind === "removed" && notice.total === 0 && notice.count > 1) {
    return messages.cart.clearedAll(notice.count)
  }
  if (notice.only !== null) {
    return notice.kind === "added"
      ? messages.cart.putOne(notice.only)
      : messages.cart.tookOne(notice.only)
  }
  return notice.kind === "added"
    ? messages.cart.putMany(notice.count)
    : messages.cart.tookMany(notice.count)
}

/**
 * How long a notice stands before it goes, in milliseconds.
 *
 * **Long enough to read a sentence and reach for the way back.** The count in
 * the top bar is the lasting record of what the cart holds; this only has to
 * outlive the press that caused it.
 */
const NOTICE_MS = 3000

/**
 * What the cart says back when it is pressed.
 *
 * **The cart is never where the press is.** A mark at the foot of a listing is
 * two thousand pixels below the count in the top bar, so without this the only
 * answer to a press is the colour of a 36px glyph. One of these stands at a
 * time, in the corner, and holds the way back to the state before the press.
 *
 * **It waits while it is being read.** The timer is held off while a pointer is
 * over the box or the focus is inside it — the way back is a control, and a
 * control that leaves while somebody is reaching for it is worse than none.
 */
export function CartToast({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)
  const { notice, dismiss, undo } = useCartNotice()
  const [reading, setReading] = useState(false)

  const at = notice?.at
  useEffect(() => {
    if (at === undefined || reading) return
    const timer = window.setTimeout(dismiss, NOTICE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [at, reading, dismiss])

  const sentence = notice === null ? "" : noticeSentence(notice, messages)
  return (
    <Toast label={messages.cart.notice} announce={sentence}>
      {notice === null
        ? undefined
        : (
            <div
              // Keyed by the press, so a second notice arriving in place of the
              // first still comes in rather than swapping its words silently.
              key={notice.at}
              onPointerEnter={() => {
                setReading(true)
              }}
              onPointerLeave={() => {
                setReading(false)
              }}
              onFocusCapture={() => {
                setReading(true)
              }}
              onBlurCapture={() => {
                setReading(false)
              }}
            >
              <Note
                kind="done"
                action={(
                  <IconButton name="close" label={messages.cart.dismiss} onClick={dismiss} />
                )}
              >
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-ink text-sm">{sentence}</span>
                  {/* Outlined rather than bare: it is the one thing in the box
                      to press, and a word in the brand colour beside a sentence
                      reads as a link back to something. */}
                  <Button type="button" variant="ghost" size="xs" onClick={undo}>
                    {messages.cart.undo}
                  </Button>
                </span>
              </Note>
            </div>
          )}
    </Toast>
  )
}

/**
 * The cart in the top bar: the count, and what it holds.
 *
 * **Collecting and checking are the same errand.** Sending a reader to another
 * page to see what they have gathered costs them the listing they were
 * gathering from — the filters, the page they had turned to, the row they were
 * next going to press. So the bar opens the collection in place, and the page
 * stays where it is.
 *
 * **What it holds are accessions, which is what was put in.** The rows on
 * `/cart` are fetched by that page from what the browser is holding; here there
 * is no fetch at all, so the panel names each dataset by the label the reader
 * pressed and hands them on to that page for anything more. **The way there
 * carries nothing** — the cart is in the browser, and the address is `/cart`.
 */
export function CartMenu({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)
  const cart = useCart()
  const count = cart.ids.length
  return (
    <Menu
      label={count === 0 ? messages.cart.open : messages.cart.openWithCount(count)}
      icon="cart"
      round
      count={count}
    >
      {count === 0
        ? (
            <p className="max-w-64 px-4 py-2 text-ink-muted text-sm">{messages.cart.empty}</p>
          )
        : (
            <>
              <p className="border-line border-b px-4 py-2 text-ink-muted text-sm">
                {messages.cart.holding(count)}
              </p>
              {/* The height is capped rather than the list cut: a hundred is
                  the most it can hold, and which ones they are is the question
                  the panel exists to answer. */}
              <ul className="max-h-64 min-w-64 overflow-y-auto">
                {cart.ids.map((id) => (
                  <li key={id} className="flex items-center gap-2 py-0.5 pr-1 pl-4">
                    <span className="grow font-mono text-sm">{id}</span>
                    <IconButton
                      name="trash"
                      label={messages.cart.removeOne(id)}
                      onClick={() => {
                        cart.remove([id])
                      }}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
      {/*
        **The way on stands whether or not anything is in the cart, and in the
        same place either way.** How many are held is the panel's subject, not a
        reason for the way to `/cart` to be there or not — a reader who has just
        emptied the cart from this very panel would otherwise press where the
        way out was and find nothing, and one who opened it to find where their
        collection is kept would be sent back to the address bar.

        **Emptying it is what leaves.** It acts on the rows above it, so with no
        rows it has nothing to act on; the way on does not, so it stays.

        **Both are outlined, and the one that leaves carries a chevron.** They
        were a bare button and a menu line — the same colour, no underline
        between them, and nothing saying that one of the two took the reader off
        the page they were collecting from.
      */}
      <div className="flex items-center justify-end gap-2 border-line border-t p-2">
        {count > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-auto"
            onClick={() => {
              cart.remove(cart.ids)
            }}
          >
            {messages.cart.clear}
          </Button>
        )}
        <ButtonLink to={href(locale, cartPath())} variant="secondary" size="sm">
          {messages.cart.view}
          <Icon name="chevron-right" aria-hidden="true" />
        </ButtonLink>
      </div>
    </Menu>
  )
}
