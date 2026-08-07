import { Link } from "react-router"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { ConditionChip } from "~/public/lists.server"
import { href, listPath, searchQuery } from "~/public/urls"
import type { SortKey } from "~/search/query.server"

/**
 * The search box is a GET form. It carries the keywords under `k` and whatever
 * conditions the box cannot show under `q`, and the listing answers with a
 * redirect to the address the two make together — so the box works with
 * JavaScript turned off and a result can be shared by copying the address.
 */
export function SearchForm({ locale, target, keyword, query, size = "normal" }: {
  locale: Locale
  target: "research" | "dataset"
  keyword: string
  /** The conditions to keep, written out; the box does not show these. */
  query: string
  size?: "normal" | "large"
}) {
  const messages = messagesFor(locale)
  const large = size === "large"
  return (
    <form method="get" action={href(locale, listPath(target))} role="search" className="flex gap-2">
      <input type="hidden" name="q" value={query} />
      <input
        type="search"
        name="k"
        defaultValue={keyword}
        aria-label={messages.search.label}
        placeholder={messages.search.placeholder}
        className={`min-w-0 flex-1 rounded border border-line bg-surface-input px-4 ${large ? "py-4 text-lg" : "py-2"}`}
      />
      <button
        type="submit"
        className={`rounded bg-accent font-bold text-white hover:bg-accent-light ${large ? "px-8 py-4" : "px-5 py-2"}`}
      >
        {messages.search.submit}
      </button>
    </form>
  )
}

/** Words a first-time reader can try, since nothing in the data suggests any. */
export function SearchExamples({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="text-ink-muted">{messages.search.examples}</span>
      {messages.search.exampleQueries.map((example) => (
        <Link
          key={example}
          to={href(locale, listPath("research") + searchQuery({ q: example, sort: null, page: 1 }))}
          className="rounded-full border border-line px-3 py-0.5 no-underline hover:bg-surface-hover"
        >
          {example}
        </Link>
      ))}
    </div>
  )
}

/**
 * The conditions the box has no way to show — a field, a negation, a nested
 * group. They are displayed rather than left implied: a filter that is working
 * without appearing anywhere is a result the reader cannot explain.
 */
export function ConditionChips({ conditions, locale }: {
  conditions: ConditionChip[]
  locale: Locale
}) {
  if (conditions.length === 0) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {conditions.map((condition) => (
        <li key={condition.label}>
          <Link
            to={condition.href}
            className="inline-flex items-center gap-2 rounded-full border border-brand bg-surface px-3 py-1 text-sm no-underline"
          >
            {condition.label}
            <span aria-hidden="true">×</span>
            <span className="sr-only">{messagesFor(locale).search.exclude}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function SortLinks({ locale, target, query, sort, options }: {
  locale: Locale
  target: "research" | "dataset"
  query: string
  sort: SortKey
  options: readonly SortKey[]
}) {
  const messages = messagesFor(locale)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-ink-muted">{messages.search.sort.label}</span>
      {options.map((option) => (
        <Link
          key={option}
          to={href(locale, listPath(target) + searchQuery({ q: query, sort: option, page: 1 }))}
          aria-current={option === sort ? "true" : undefined}
          className={option === sort ? "font-semibold no-underline text-ink" : ""}
        >
          {messages.search.sort[option]}
        </Link>
      ))}
    </div>
  )
}

/**
 * Page links, and nothing clever. Every ordering ends in the row's label, so a
 * row cannot move between pages and be seen twice or not at all.
 */
export function Pagination({ locale, target, query, sort, page, pageCount }: {
  locale: Locale
  target: "research" | "dataset"
  query: string
  sort: SortKey
  page: number
  pageCount: number
}) {
  const messages = messagesFor(locale)
  if (pageCount <= 1) return null
  const at = (to: number) =>
    href(locale, listPath(target) + searchQuery({ q: query, sort, page: to }))
  const window = [...new Set([
    1,
    ...[page - 2, page - 1, page, page + 1, page + 2].filter((n) => n > 1 && n < pageCount),
    pageCount,
  ])].sort((a, b) => a - b)

  return (
    <nav aria-label={messages.search.pagination} className="mt-6 flex flex-wrap items-center gap-2 text-sm">
      {page > 1 && <Link to={at(page - 1)}>{messages.search.previousPage}</Link>}
      {window.map((number, index) => (
        <span key={number} className="flex items-center gap-2">
          {index > 0 && (window[index - 1] ?? 0) < number - 1 && (
            <span className="text-ink-muted" aria-hidden="true">…</span>
          )}
          {number === page
            ? <span className="font-semibold" aria-current="page">{number}</span>
            : <Link to={at(number)}>{number}</Link>}
        </span>
      ))}
      {page < pageCount && <Link to={at(page + 1)}>{messages.search.nextPage}</Link>}
    </nav>
  )
}

/**
 * What is shown when nothing matched. No relaxed search is run behind it: the
 * only honest count is of a search somebody asked for.
 */
export function NoResults({ locale, other }: { locale: Locale, other?: React.ReactNode }) {
  const messages = messagesFor(locale)
  return (
    <div className="mt-6 border border-line bg-surface px-5 py-6">
      <p className="font-semibold">{messages.search.none}</p>
      <p className="mt-1 text-ink-muted text-sm">{messages.search.noneHint}</p>
      {other !== undefined && <p className="mt-3 text-sm">{other}</p>}
      <h2 className="mt-5 font-semibold text-ink-muted text-xs">{messages.search.syntaxTitle}</h2>
      <ul className="mt-1 flex flex-col gap-1 text-ink-muted text-sm">
        <li>{messages.search.syntaxSpace}</li>
        <li>{messages.search.syntaxComma}</li>
        <li>{messages.search.syntaxQuote}</li>
      </ul>
    </div>
  )
}

export function InvalidQuery({ locale, column }: { locale: Locale, column: number }) {
  const messages = messagesFor(locale)
  return (
    <p className="mt-6 border border-danger bg-surface px-5 py-4 text-sm">
      {messages.search.invalid}
      {" "}
      <span className="text-ink-muted">
        {column}
      </span>
    </p>
  )
}
