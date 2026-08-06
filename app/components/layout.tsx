import { Link, useLocation } from "react-router"

import { LOCALES, type Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"

/**
 * The language switch points at the same page in the other language rather than
 * at its front page: the two addresses of a page differ only by the prefix, so
 * the switch is the current path with a different prefix on it.
 */
function otherLocale(locale: Locale): Locale {
  return LOCALES.find((candidate) => candidate !== locale) ?? locale
}

export function SiteHeader({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)
  const other = otherLocale(locale)
  const { path } = readLocale(useLocation().pathname)

  return (
    <header className="border-line border-b">
      <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-4 py-3">
        <Link to={href(locale, "/")} className="font-bold text-lg no-underline">
          {messages.siteName}
        </Link>
        <Link to={href(other, path)} hrefLang={other} lang={other} className="text-sm">
          {messages.otherLanguage}
        </Link>
      </div>
    </header>
  )
}

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="mt-16 border-line border-t bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-6 text-ink-muted text-sm">
        {messagesFor(locale).siteName}
      </div>
    </footer>
  )
}
