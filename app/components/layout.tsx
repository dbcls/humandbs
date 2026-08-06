import { Link, useLocation } from "react-router"

import { Markdown } from "~/components/markdown"
import { LOCALES, type Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { FOOTER, NAVBAR, navLabel, type NavEntry, type NavLink as NavLinkItem } from "~/public/navigation"
import { href, readLocale } from "~/public/urls"

/**
 * The language switch points at the same page in the other language rather than
 * at its front page: the two addresses of a page differ only by the prefix, so
 * the switch is the current path with a different prefix on it.
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

export function SiteHeader({ locale, alerts }: { locale: Locale, alerts: string[] }) {
  const messages = messagesFor(locale)
  const other = otherLocale(locale)
  const { path } = readLocale(useLocation().pathname)

  return (
    <header className="border-line border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-4 py-3">
        <Link to={href(locale, "/")} className="font-bold text-lg no-underline">
          {messages.siteName}
        </Link>
        <Link to={href(other, path)} hrefLang={other} lang={other} className="text-sm">
          {messages.otherLanguage}
        </Link>
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
