import { Form, Link, useLocation } from "react-router"

import { Markdown } from "~/components/markdown"
import { LOCALES, type Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { FOOTER, NAVBAR, navLabel, type NavEntry, type NavLink as NavLinkItem } from "~/public/navigation"
import { href, readLocale } from "~/public/urls"

/**
 * The language switch points at the same page in the other language rather than
 * at its front page: the two addresses of a page differ only by the prefix, so
 * the switch is the current address with a different prefix on it. **The query
 * string comes along** — on a listing it holds the search, and dropping it
 * would answer "read this in English" with a different page.
 */
function otherLocale(locale: Locale): Locale {
  return LOCALES.find((candidate) => candidate !== locale) ?? locale
}

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
      <NavItemLink
        item={entry}
        locale={locale}
        className="block whitespace-nowrap px-3 py-2 font-medium text-sm no-underline"
      />
      {children.length > 0 && (
        <ul className="absolute top-full left-0 z-10 hidden min-w-max border border-line bg-white py-1 shadow-lg group-focus-within:block group-hover:block">
          {children.map((child) => (
            <li key={child.path}>
              <NavItemLink
                item={child}
                locale={locale}
                className="block whitespace-nowrap px-4 py-2 text-sm no-underline hover:bg-surface-hover"
              />
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
 * The link is a plain anchor because `/auth/login` answers with a redirect to
 * Keycloak and has no page behind it; a client-side navigation would ask it for
 * data instead of following it. Signing out is a POST, so that neither a link
 * nor an image somebody else placed can end a session.
 */
function AccountMenu({ account, locale }: { account: Account | null, locale: Locale }) {
  const messages = messagesFor(locale)
  const location = useLocation()

  if (account === null) {
    const back = new URLSearchParams({ redirect: `${location.pathname}${location.search}` })
    return (
      <a href={`/auth/login?${back.toString()}`} className="text-sm">
        {messages.account.logIn}
      </a>
    )
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-ink-muted">{account.name}</span>
      {account.isAdmin && <Link to={href(locale, "/admin")}>{messages.account.admin}</Link>}
      <Form method="post" action="/auth/logout">
        <button type="submit" className="cursor-pointer underline">
          {messages.account.logOut}
        </button>
      </Form>
    </div>
  )
}

export function SiteHeader({ locale, alerts, account }: {
  locale: Locale
  alerts: string[]
  account: Account | null
}) {
  const messages = messagesFor(locale)
  const other = otherLocale(locale)
  const location = useLocation()
  const { path } = readLocale(location.pathname)

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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to={href(locale, "/")} className="font-bold text-lg no-underline">
          {messages.siteName}
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to={`${href(other, path)}${location.search}`}
            hrefLang={other}
            lang={other}
            className="text-sm"
          >
            {messages.otherLanguage}
          </Link>
          <AccountMenu account={account} locale={locale} />
        </div>
      </div>

      <nav aria-label={messages.globalNavigation} className="border-line border-t">
        <ul className="mx-auto flex max-w-6xl flex-wrap items-center px-1">
          {NAVBAR.map((entry) => <NavbarEntry key={entry.path} entry={entry} locale={locale} />)}
        </ul>
      </nav>

      {alerts.length > 0 && (
        <div aria-label={messages.announcements} className="border-accent border-t-2 bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-3 text-sm">
            {alerts.map((html, index) => <Markdown key={index} html={html} />)}
          </div>
        </div>
      )}
    </header>
  )
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)

  return (
    <footer className="mt-16 border-line border-t bg-surface">
      <nav aria-label={messages.siteMap} className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="font-semibold text-ink-muted text-sm">{messages.siteMap}</h2>
        <div className="mt-4 columns-1 gap-8 sm:columns-2 lg:columns-3">
          {FOOTER.map((entry) => (
            <section key={entry.path} className="mb-6 break-inside-avoid">
              <h3 className="text-ink-muted text-xs">
                <NavItemLink item={entry} locale={locale} className="no-underline" />
              </h3>
              {(entry.children ?? []).length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {(entry.children ?? []).map((child) => (
                    <li key={child.path}>
                      <NavItemLink item={child} locale={locale} className="text-xs" />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </nav>
      <div className="mx-auto max-w-6xl border-line border-t px-4 py-4 text-ink-muted text-sm">
        {messages.siteName}
      </div>
    </footer>
  )
}
