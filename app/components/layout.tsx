import { useState } from "react"
import { Form, Link, useLocation } from "react-router"

import { useCart } from "~/cart/store"
import {
  Announcement,
  LanguagePills,
  Menu,
  MENU_ITEM,
  MENU_ITEM_HERE,
  RoundLink,
  Stack,
} from "~/components/base"
import { Markdown } from "~/components/markdown"
import { LOCALES, type Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import {
  FOOTER,
  NAVBAR,
  NAVBAR_MENU_STEP,
  NAVBAR_STEP,
  navLabel,
  type NavLink as NavLinkItem,
} from "~/public/navigation"
import { cartPath, href, normalizeQuery, readLocale } from "~/public/urls"

/**
 * Whether an entry names the page being looked at.
 *
 * **A destination covers what is under it.** The guidelines index is the entry
 * in the bar and a guideline answers at a path below it, so both have to light
 * the same word — a reader who followed a link from the index has not left it.
 * The listings are the same shape (`/research/hum0103/v4`). The trailing slash
 * is what keeps `/data-use` from claiming `/data-users`.
 */
function isHere(here: string, path: string): boolean {
  return here === path || here.startsWith(`${path}/`)
}

function NavItemLink({ item, locale, here, className, whenHere }: {
  item: NavLinkItem
  locale: Locale
  /**
   * The address being looked at, with the language prefix taken off. **The
   * sitemap in the footer does not pass one**: it is a map of the whole site,
   * and where the reader is now is said by the bar and by the breadcrumb.
   */
  here?: string
  className?: string
  whenHere?: string
}) {
  const current = here !== undefined && whenHere !== undefined && isHere(here, item.path)
  return (
    <Link
      to={href(locale, item.path)}
      className={current ? whenHere : className}
      aria-current={current ? "page" : undefined}
    >
      {navLabel(item.label, locale)}
    </Link>
  )
}

/** How an entry in the top bar is drawn. */
const NAV_ITEM
  = "block whitespace-nowrap px-2 py-2 font-medium text-ink text-sm no-underline hover:text-brand"

/**
 * The same entry when the reader is on it. Heavier and in the brand colour, so
 * that where they are is legible without reading the address — and written out
 * whole rather than added to the one above, because two classes setting one
 * property are settled by the order the styles happen to be in.
 */
const NAV_ITEM_HERE
  = "block whitespace-nowrap px-2 py-2 font-bold text-brand text-sm no-underline"

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
    // The query is read through `normalizeQuery`, so the address written into
    // the way back is the same one whichever side drew this link.
    const back = new URLSearchParams({
      redirect: `${location.pathname}${normalizeQuery(location.search)}`,
    })
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
 * **They sit below the bar rather than inside it.** The bar is the site's own
 * furniture and is white; a notice is something the office is saying today, and
 * drawn on the same white it read as part of the furniture. Below the bar it is
 * on the page's tint, which is where v1 puts it and what makes it look temporary.
 *
 * They are stacked rather than folded into one: each is a separate thing the
 * office needs read, and there are two or three of them at a time. Closing one
 * is remembered for as long as the page is open (`Announcement`), which is why
 * this holds the state rather than the notice itself.
 */
export function Announcements({ alerts, locale }: { alerts: string[], locale: Locale }) {
  const messages = messagesFor(locale)
  const [dismissed, setDismissed] = useState<number[]>([])
  const showing = alerts
    .map((html, index) => ({ html, index }))
    .filter(({ index }) => !dismissed.includes(index))

  if (showing.length === 0) return null
  return (
    <section
      aria-label={messages.announcements}
      // The width of the window, held to the same edge as the bar above: what
      // the site says to everybody belongs to the window rather than to the
      // page, and a notice indented to the width of a page under a full-width
      // bar reads as belonging to the screen underneath it.
      className="w-full px-4 pt-4 sm:px-page-gutter"
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
 * **One row**, the way v1 has it: the wordmark, the navigation, and the three
 * controls that are not navigation — the language, the cart, and the account.
 * What the row cannot fit goes behind the overflow control at the end of the
 * navigation rather than being dropped (`public/navigation.ts`).
 *
 * **There is no way to search from here.** A reader searches from the front
 * page or from a listing, and both of those have the box itself; a circle in
 * the bar that only took you to the listing was a third thing to learn.
 */
export function SiteHeader({ locale, account, managing = false }: {
  locale: Locale
  account: Account | null
  /**
   * Whether this is a management screen.
   *
   * **The bar keeps the wordmark, the languages and the account, and drops
   * everything else** — the row of destinations and the cart are addressed to
   * readers. Where the management area is gone from is not here at all: it is
   * against the left edge of the window (`components/admin.tsx`), so that the
   * screens keep the whole of it. `root.tsx` decides this from the address.
   */
  managing?: boolean
}) {
  const messages = messagesFor(locale)
  const location = useLocation()
  const { path } = readLocale(location.pathname)
  const cart = useCart()

  // No rule along the bottom of the bar: it is white and the page under it is
  // a tint, so where one stops is already drawn. A line there is a third edge
  // between two that are visible.
  return (
    <header className="bg-white">
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

        It keeps the same room at its edges as everything else that reaches
        them, so that the bar, the notices, the page and the sitemap begin on
        one line down the left of the screen.
      */}
      {/*
        The same room above and below, so that **the navigation and the
        controls sit at the middle of the bar**. The site's name hangs into the
        lower half of it (see the wordmark below), which is what the room at
        the bottom is for.
      */}
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-page-gutter">
        {/*
          The wordmark is the portal's own artwork, carried over as it is; the
          site's name in the reader's language is set under it rather than drawn
          into it, so that it can be translated and read aloud.

          **The name is taken out of the flow**, so that the pair is not a
          two-line block whose centring would push the drawing far above the
          line everything else sits on.

          **The pair is then lifted off that line by a few pixels.** What hangs
          under the wordmark still has weight, and a logo whose drawing is
          exactly level with the navigation reads as sitting low in the bar. The
          shift is a transform rather than a margin, so it moves the name with
          the drawing and asks nothing of the row.
        */}
        <Link
          to={href(locale, "/")}
          className="-translate-y-1 relative flex shrink-0 items-center no-underline"
        >
          <img src="/humandb.svg" alt="" width={240} height={33} className="w-48" />
          <span className="absolute inset-x-0 top-full text-center font-semibold text-brand text-xs">
            {messages.siteName}
          </span>
        </Link>

        {!managing && (
          <nav aria-label={messages.globalNavigation} className="flex min-w-0 flex-1 items-center gap-1">
            {/*
          **One row that never wraps.** A gap between the entries rather than
          none: two links whose rectangles touch send a press near the
          boundary to the wrong one. Each entry appears at the width its step
          allows and is in the menu below that width — the two are written as
          complements in `public/navigation.ts`, so nothing can fall out of
          both.
        */}
            <ul className="flex min-w-0 flex-nowrap items-center gap-x-1 overflow-hidden">
              {NAVBAR.map((item, index) => (
                <li key={item.path} className={NAVBAR_STEP[index]?.bar ?? "hidden"}>
                  <NavItemLink
                    item={item}
                    locale={locale}
                    here={path}
                    className={NAV_ITEM}
                    whenHere={NAV_ITEM_HERE}
                  />
                </li>
              ))}
            </ul>
            {/*
          The menu sits at the end of the navigation because that is where the
          row runs out, and it holds destinations rather than actions — so it
          carries its name rather than a glyph on its own.
        */}
            <div className={NAVBAR_MENU_STEP}>
              <Menu label={messages.moreNavigation} icon="menu" word>
                {/*
            **What did not fit today, and nothing else.** Which side a
            destination falls on is an accident of the window's width, so at a
            width where the bar holds everything the menu has nothing under it.
          */}
                {NAVBAR.map((item, index) => (
                  <span key={item.path} className={NAVBAR_STEP[index]?.menu ?? ""}>
                    <NavItemLink
                      item={item}
                      locale={locale}
                      here={path}
                      className={MENU_ITEM}
                      whenHere={MENU_ITEM_HERE}
                    />
                  </span>
                ))}
              </Menu>
            </div>
          </nav>
        )}

        {/*
          **Hard against the right edge.** On a public page the navigation
          before it fills the row and puts them there; a management screen has
          no navigation, and without this the three controls would sit against
          the wordmark with the rest of the bar empty behind them.
        */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/*
            The pills keep one order whichever language is being read (v1 puts
            EN before JA), so that the pair does not swap places as the reader
            switches and the one they want is where it was.

            **The search goes with them**, so that switching language on a
            listing keeps the listing — read through `normalizeQuery`, which is
            what makes the address the same one on the server and in the
            browser (`public/urls.ts`).
          */}
          <LanguagePills
            label={messages.language}
            options={[...LOCALES].sort().map((code) => ({
              code,
              label: code.toUpperCase(),
              to: `${href(code, path)}${normalizeQuery(location.search)}`,
              current: code === locale,
            }))}
          />
          {/*
            The address carries what the cart holds, so that following it lands
            on the rows rather than on an empty cart that fills in a moment
            later. The count is in the name as well as on the glyph: a label
            replaces what is inside a link, so a number left in the markup alone
            would be read by nobody who cannot see it.
          */}
          {/*
            **Not on a management screen.** The cart is a reader collecting
            datasets to ask for, which is not what somebody editing them is
            doing; it would sit there holding nothing on all eighteen of them.
          */}
          {!managing && (
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
          )}
          <AccountControl account={account} locale={locale} />
        </div>
      </div>
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
 *
 * **Where the tint stops is the whole of the separation.** A gap above it and a
 * rule along its top said the same thing twice, and the rule read as a stray
 * line drawn under the page rather than as the start of the footer.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)
  const named = FOOTER.filter((entry) => (entry.children ?? []).length > 0)
  const rest = FOOTER.filter((entry) => (entry.children ?? []).length === 0)

  return (
    <footer className="bg-white">
      <nav
        aria-label={messages.siteMap}
        className="relative mx-auto w-full max-w-content-max px-4 py-8 sm:px-page-gutter"
      >
        {/*
          The centre's mark sits in the corner and out of the flow. Set beside
          the heading it was the tallest thing in that row, and the whole
          sitemap started 40px lower than the words it belongs to.
        */}
        <a
          href="https://dbcls.rois.ac.jp/"
          target="_blank"
          rel="noreferrer"
          className="absolute top-8 right-4 sm:right-page-gutter"
        >
          <img src="/logo-dbcls.svg" alt="DBCLS" width={132} height={60} className="h-10 w-auto" />
        </a>
        <Stack gap="normal">
          <h2 className="font-semibold text-brand text-sm">{messages.siteMap}</h2>
          {/*
            **Only the two entries that name documents get a column.** Eleven
            destinations across four columns left three of them holding one line
            against a column of four, and the row grew to the tallest of them —
            a hole the height of the sitemap itself. The other nine are one
            line each and read across, which is what they are.
          */}
          {/*
            **The name of a group is a label, and the group's own page is the
            first link under it.** Drawn as the heading itself the destination
            was there but did not look like one — a sitemap where one of the
            eleven ways through is the only one not underlined. v1 lists the
            parent among its children for the same reason.
          */}
          {/*
            **The columns are as wide as what is in them, not half each.** The
            names here are the guidelines' own, and the longest of them wants
            eleven pixels more than half the page — which left two characters of
            it alone on a second line, beside a column whose three entries are a
            hundred pixels wide and had six hundred to sit in.

            The floor on the second column is what stops the first from taking
            everything on a narrow screen: Japanese breaks between any two
            characters, so a column with no floor collapses to one glyph wide
            rather than making the other one wrap.
          */}
          <div className="grid gap-8 sm:grid-cols-[auto_minmax(12rem,1fr)]">
            {named.map((entry) => (
              <Stack key={entry.path} gap="tight" as="section">
                {/* Lighter than what is under it: the name of a group is there
                    to be skipped past on the way to a link. */}
                <h3 className="text-ink-muted text-xs">{navLabel(entry.label, locale)}</h3>
                {/* The size is on the line rather than on the link inside it:
                    a list whose items are 12px text but whose own font is the
                    page's leaves a 24px line box around every 18px line. */}
                <Stack gap="tight" as="ul">
                  {[entry, ...entry.children ?? []].map((item) => (
                    <li key={item.path} className="text-xs">
                      <NavItemLink item={item} locale={locale} />
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
    </footer>
  )
}
