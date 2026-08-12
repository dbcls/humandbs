import { CART_LIMIT, isCartable, useCart } from "~/cart/store"
import { Button, IconButton } from "~/components/base"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

/**
 * The cart marks the listings and the dataset page carry.
 *
 * **One control puts a whole row in or takes it out.** A research row stands for
 * every JGA dataset under it, the header cell stands for the page, and the
 * dataset page for one — the difference between them is only which accessions
 * they name, so they are the same control.
 *
 * A row whose datasets cannot be applied for shows nothing at all rather than a
 * disabled mark: an unrestricted-access dataset needs no application, and a
 * control that can never do anything is noise in every row of the table.
 *
 * The cart lives in the browser, so on the server every mark draws as "not in
 * the cart" and corrects itself once the page is running. That is why the state
 * is announced (`aria-pressed`) rather than only coloured.
 */
export function CartToggle({ ids, locale, whole = false }: {
  ids: string[]
  locale: Locale
  /** Whether this stands for a table rather than a single row. It sits in the
   *  header, which is a band, so it is drawn for a band. */
  whole?: boolean
}) {
  const messages = messagesFor(locale)
  const cart = useCart()
  const cartable = [...new Set(ids.filter(isCartable))]
  const held = cartable.filter((id) => cart.ids.includes(id))

  if (cartable.length === 0) return null
  // **Partly in the cart is its own state.** A research with twenty datasets of
  // which nineteen are collected is not "not collected", and saying so would
  // make the control read as untouched.
  const state = held.length === 0 ? false : held.length === cartable.length ? true : "mixed"
  return (
    <IconButton
      name="cart"
      pressed={state}
      onBand={whole}
      label={whole ? messages.cart.togglePage : messages.cart.toggleRow}
      onClick={() => {
        if (state === true) cart.remove(cartable)
        else cart.add(cartable)
      }}
    />
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
  const full = !held && cart.ids.length >= CART_LIMIT

  if (!isCartable(datasetLabel)) return null
  return (
    <span className="flex flex-wrap items-center gap-2">
      {full && <span className="text-sm text-white">{messages.cart.full(CART_LIMIT)}</span>}
      <Button
        type="button"
        variant={held ? "secondary" : "accent"}
        pill
        disabled={full}
        icon={<Icon name={held ? "check" : "cart"} />}
        onClick={() => {
          if (held) cart.remove([datasetLabel])
          else cart.add([datasetLabel])
        }}
      >
        {held ? messages.cart.added : messages.cart.add}
      </Button>
    </span>
  )
}
