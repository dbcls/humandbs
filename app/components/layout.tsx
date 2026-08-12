import { useState } from "react"
import { Form, Link, useLocation } from "react-router"

import { useCart } from "~/cart/store"
import {
  Announcement,
  LanguagePills,
  Menu,
  MENU_ITEM,
  MENU_PANEL,
  RoundLink,
  Stack,
} from "~/components/base"
import { Icon } from "~/components/icons"
import { Markdown } from "~/components/markdown"
import { LOCALES, type Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import {
  FOOTER,
  NAVBAR,
  NAVBAR_MORE,
  navLabel,
  type NavEntry,
  type NavLink as NavLinkItem,
} from "~/public/navigation"
import { cartPath, href, listPath, readLocale } from "~/public/urls"

function NavItemLink({ item, locale, className }: {
  item: NavLinkItem
  locale: Locale
  className?: string
}) {
  return (
    <Link to={href(locale, item.path)} className={className}>
      {navLabel(item.label, locale)}
    </Link>
  )
}

/**
 * An entry that has children opens on hover and on keyboard focus. It is not a
 * disclosure widget: the entry itself is a link to the same place its first
 * child points at, so the menu never becomes the only way through.
 */
function NavbarEntry({ entry, locale }: { entry: NavEntry, locale: Locale }) {
  const children = entry.children ?? []
  return (
    <li className="group relative">
      <span className="flex items-center">
        <NavItemLink
          item={entry}
          locale={locale}
          className="block whitespace-nowrap px-2 py-2 font-medium text-ink text-sm no-underline hover:text-brand"
        />
        {children.length > 0 && (
          <Icon name="chevron-down" aria-hidden="true" className="-ml-1.5 text-ink-muted text-xs" />
        )}
      </span>
      {children.length > 0 && (
        <ul className={`absolute top-full left-0 z-10 hidden ${MENU_PANEL} group-focus-within:flex group-hover:flex`}>
          {children.map((child) => (
            <li key={child.path}>
              <NavItemLink item={child} locale={locale} className={MENU_ITEM} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** What the header knows about the person asking. Never their capabilities. */
export interface Account {
  name: string
  isAdmin: boolean
}

/**
 * Signing in and out.
 *
 * Signing in is a plain anchor because `/auth/login` answers with a redirect to
 * Keycloak and has no page behind it; a client-side navigation would ask it for
 * data instead of following it. Signing out is a POST, so that neither a link
 * nor an image somebody else placed can end a session.
 *
 * Once signed in the circle becomes a menu: a name, the way to the admin
 * screens, and the way out. Those three would take more room across the top bar
 * than they are worth, and none of them is wanted often.
 */
function AccountControl({ account, locale }: { account: Account | null, locale: Locale }) {
  const messages = messagesFor(locale)
  const location = useLocation()

  if (account === null) {
    const back = new URLSearchParams({ redirect: `${location.pathname}${location.search}` })
    return (
      <RoundLink
        to={`/auth/login?${back.toString()}`}
        name="log-in"
        label={messages.account.logIn}
        filled
        external
      />
    )
  }

  return (
    <Menu label={messages.account.menu} icon="menu" round>
      <span className="border-line border-b px-4 py-2 text-ink-muted text-sm">{account.name}</span>
      {account.isAdmin && (
        <Link
          to={href(locale, "/admin")}
          className="px-4 py-2 text-sm no-underline hover:bg-surface-hover"
        >
          {messages.account.admin}
        </Link>
      )}
      <Form method="post" action="/auth/logout">
        <button
          type="submit"
          className="w-full cursor-pointer px-4 py-2 text-left text-sm hover:bg-surface-hover"
        >
          {messages.account.logOut}
        </button>
      </Form>
    </Menu>
  )
}

/**
 * The notices above every page.
 *
 * They are stacked rather than folded into one: each is a separate thing the
 * office needs read, and there are two or three of them at a time. Closing one
 * is remembered for as long as the page is open (`Announcement`), which is why
 * this holds the state rather than the notice itself.
 */
function Announcements({ alerts, locale }: { alerts: string[], locale: Locale }) {
  const messages = messagesFor(locale)
  const [dismissed, setDismissed] = useState<number[]>([])
  const showing = alerts
    .map((html, index) => ({ html, index }))
    .filter(({ index }) => !dismissed.includes(index))

  if (showing.length === 0) return null
  return (
    <section
      aria-label={messages.announcements}
      // Held to the width of a page rather than of the window: these are
      // sentences to read, and a line of them across 1440px runs past a hundred
      // characters. The bar above may be full width — a notice may not.
      className="mx-auto w-full max-w-content-max px-4 py-2 sm:px-page-gutter"
    >
      <Stack gap="tight">
        {showing.map(({ html, index }) => (
          <Announcement
            key={index}
            dismiss={messages.dismissAnnouncement}
            onDismiss={() => { setDismissed((was) => [...was, index]) }}
          >
            <Markdown html={html} />
          </Announcement>
        ))}
      </Stack>
    </section>
  )
}

/**
 * The bar across the top of every page.
 *
 * **One row**, the way v1 has it: the wordmark, the navigation, and the
 * controls that are not navigation — the language, the search, the cart, and
 * the account. What the row cannot fit goes behind the overflow control at the
 * end of the navigation rather than being dropped (`public/navigation.ts`).
 *
 * **The search here is a link to the research listing, not a box.** The two
 * places a reader searches from are the front page and a listing, and a box in
 * the header would be a third that behaves differently from both.
 */
export function SiteHeader({ locale, alerts, account }: {
  locale: Locale
  alerts: string[]
  account: Account | null
}) {
  const messages = messagesFor(locale)
  const location = useLocation()
  const { path } = readLocale(location.pathname)
  const cart = useCart()

  return (
    <header className="border-line border-b bg-white">
      {/*
        The first thing focus reaches, and out of the way until it is reached.
        Every page puts the same id on its <main>, so this needs nothing from
        the page it is on.
      */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-20 focus:bg-white focus:px-3 focus:py-2"
      >
        {messages.skipToContent}
      </a>
      {/*
        The bar runs the width of the window rather than stopping at the width
        of a page: it holds nine destinations (eight plus the overflow) and four
        controls, and v1's own header does the same. The page under it is
        centred and narrower, which is where the reading happens.
      */}
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-page-gutter">
        {/*
          The wordmark is the portal's own artwork, carried over as it is; the
          site's name in the reader's language is set under it rather than drawn
          into it, so that it can be translated and read aloud.
        */}
        <Link to={href(locale, "/")} className="flex shrink-0 flex-col no-underline">
          <img src="/humandb.svg" alt="" width={240} height={33} className="w-48" />
          <span className="text-center font-semibold text-brand text-xs">
            {messages.siteName}
          </span>
        </Link>

        <nav aria-label={messages.globalNavigation} className="min-w-0 flex-1">
          {/* A gap between the entries rather than none: two links whose
              rectangles touch send a press near the boundary to the wrong one. */}
          <ul className="flex flex-wrap items-center gap-x-1">
            {NAVBAR.map((entry) => <NavbarEntry key={entry.path} entry={entry} locale={locale} />)}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/*
            The overflow sits between the navigation and the controls because
            that is where the row runs out, and it holds navigation rather than
            controls — so it names itself as such.
          */}
          <Menu label={messages.moreNavigation}>
            {NAVBAR_MORE.map((item) => (
              <NavItemLink
                key={item.path}
                item={item}
                locale={locale}
                className="block whitespace-nowrap px-4 py-2 text-sm no-underline hover:bg-surface-hover"
              />
            ))}
          </Menu>
          {/*
            The pills keep one order whichever language is being read (v1 puts
            EN before JA), so that the pair does not swap places as the reader
            switches and the one they want is where it was.
          */}
          <LanguagePills
            label={messages.language}
            options={[...LOCALES].sort().map((code) => ({
              code,
              label: code.toUpperCase(),
              to: `${href(code, path)}${location.search}`,
              current: code === locale,
            }))}
          />
          <RoundLink
            to={href(locale, listPath("research"))}
            name="search"
            label={messages.search.label}
          />
          {/*
            The address carries what the cart holds, so that following it lands
            on the rows rather than on an empty cart that fills in a moment
            later. The count is in the name as well as on the glyph: a label
            replaces what is inside a link, so a number left in the markup alone
            would be read by nobody who cannot see it.
          */}
          <RoundLink
            to={cart.ids.length === 0
              ? href(locale, cartPath())
              : `${href(locale, cartPath())}?${new URLSearchParams({ ids: cart.ids.join(",") }).toString()}`}
            name="cart"
            label={cart.ids.length === 0
              ? messages.cart.open
              : messages.cart.openWithCount(cart.ids.length)}
            count={cart.ids.length}
          />
          <AccountControl account={account} locale={locale} />
        </div>
      </div>

      <Announcements alerts={alerts} locale={locale} />
    </header>
  )
}

/**
 * The sitemap at the foot of every page.
 *
 * Four columns of links under one heading, with the centre's mark opposite it —
 * v1's arrangement, and the reason the footer carries more than the top bar
 * does: it is where the four guidelines are named in full and where anything
 * the bar had no room for can still be reached.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)
  const named = FOOTER.filter((entry) => (entry.children ?? []).length > 0)
  const rest = FOOTER.filter((entry) => (entry.children ?? []).length === 0)

  return (
    <footer className="mt-8 border-line border-t bg-white">
      <nav
        aria-label={messages.siteMap}
        className="mx-auto w-full max-w-content-max px-4 py-8 sm:px-page-gutter"
      >
        <Stack gap="block">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-semibold text-brand text-sm">{messages.siteMap}</h2>
            <a href="https://dbcls.rois.ac.jp/" target="_blank" rel="noreferrer">
              <img
                src="/logo-dbcls.svg"
                alt="DBCLS"
                width={132}
                height={60}
                className="h-10 w-auto"
              />
            </a>
          </div>
          {/*
            **Only the two entries that name documents get a column.** Eleven
            destinations across four columns left three of them holding one line
            against a column of four, and the row grew to the tallest of them —
            a hole the height of the sitemap itself. The other nine are one
            line each and read across, which is what they are.
          */}
          <div className="grid gap-8 sm:grid-cols-2">
            {named.map((entry) => (
              <Stack key={entry.path} gap="tight" as="section">
                <h3 className="font-semibold text-sm">
                  <NavItemLink
                    item={entry}
                    locale={locale}
                    className="text-ink-muted no-underline hover:text-brand"
                  />
                </h3>
                <Stack gap="tight" as="ul">
                  {(entry.children ?? []).map((child) => (
                    <li key={child.path}>
                      <NavItemLink item={child} locale={locale} className="text-xs" />
                    </li>
                  ))}
                </Stack>
              </Stack>
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            {rest.map((entry) => (
              <li key={entry.path}>
                <NavItemLink item={entry} locale={locale} />
              </li>
            ))}
          </ul>
        </Stack>
      </nav>
      <div className="mx-auto w-full max-w-content-max border-line border-t px-4 py-4 text-ink-muted text-sm sm:px-page-gutter">
        {messages.siteName}
      </div>
    </footer>
  )
}
