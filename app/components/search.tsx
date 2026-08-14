import { useState, type ReactNode } from "react"
import { Link } from "react-router"

import {
  BAND_FILL,
  Button,
  ButtonLink,
  Chip,
  Heading,
  Note,
  Stack,
  SwitchTabs,
} from "~/components/base"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { ConditionChip, ListShell } from "~/public/lists.server"
import { exportPath, href, listPath, searchQuery } from "~/public/urls"
import type { SortKey } from "~/search/query.server"

import { Card, Crumbs, Page, PageLinks } from "./page"

/**
 * The search box is a GET form. It carries the keywords under `k` and whatever
 * conditions the box cannot show under `q`, and the listing answers with a
 * redirect to the address the two make together — so the box works with
 * JavaScript turned off and a result can be shared by copying the address.
 *
 * The rounded field and the round pink button are v1's, and the button says
 * what it does with a glyph and its accessible name rather than a word: it is
 * the same control on the front page and over a listing, at two sizes.
 */
/**
 * The box itself: a rounded field with the round accent button inside it.
 *
 * **Every search on the site is this shape**, whatever it searches. The listings
 * search the index and the announcements are one `ILIKE` over 682 rows, but a
 * reader typing into a box does not know that and should not have to — the
 * announcements screen used to draw its own field with an outlined pill button
 * and a word on it, which read as a different kind of thing entirely.
 *
 * **This is the one control drawn without an edge** (`docs/ui.md`): a filled
 * pill with a coloured button in it is not mistakable for anything else on the
 * page, and the rule that asks for a visible edge is there for the fields that
 * look like nothing until you find them.
 */
export function SearchBox({ action, name, value, label, placeholder, submit, size = "normal", children }: {
  action: string
  /** What the typed words are called in the address. */
  name: string
  value: string
  label: string
  placeholder: string
  submit: string
  /** The front page asks with a large one; everywhere else it sits over a list. */
  size?: "normal" | "large"
  /** What the form has to carry that the box does not show. */
  children?: ReactNode
}) {
  const large = size === "large"
  return (
    // The button sits inside the field rather than beside it, the way v1 draws
    // it: the two are one control, and set apart they read as a box and an
    // unrelated circle. The field keeps room for it on the right.
    <form method="get" action={action} role="search" className="relative flex items-center">
      {children}
      <input
        type="search"
        name={name}
        defaultValue={value}
        aria-label={label}
        placeholder={placeholder}
        className={`min-w-0 flex-1 rounded-full bg-surface py-2.5 text-ink ${large ? "pr-12 pl-5 text-base" : "pr-11 pl-4"}`}
      />
      {/*
        The button is the standard tap size at both sizes, and the field is
        deep enough to hold it: a circle that grew with the field would be the
        one control on the site whose size depends on where it is.
      */}
      <button
        type="submit"
        aria-label={submit}
        title={submit}
        className={`absolute inline-flex size-tap shrink-0 cursor-pointer items-center justify-center rounded-full text-white hover:brightness-90 ${BAND_FILL.accent} ${large ? "right-1.5" : "right-1"}`}
      >
        <Icon name="search" className="text-base" />
      </button>
    </form>
  )
}

export function SearchForm({
  locale,
  target,
  keyword,
  query,
  facet = null,
  find = "",
  size = "normal",
}: {
  locale: Locale
  target: "research" | "dataset"
  keyword: string
  /** The conditions to keep, written out; the box does not show these. */
  query: string
  /** Which facet is open, so that searching again does not close it. */
  facet?: string | null
  find?: string
  size?: "normal" | "large"
}) {
  const messages = messagesFor(locale)
  return (
    <SearchBox
      action={href(locale, listPath(target))}
      name="k"
      value={keyword}
      label={messages.search.placeholder[target]}
      placeholder={messages.search.placeholder[target]}
      submit={messages.search.submit}
      size={size}
    >
      <input type="hidden" name="q" value={query} />
      {facet !== null && <input type="hidden" name="facet" value={facet} />}
      {find !== "" && <input type="hidden" name="find" value={find} />}
    </SearchBox>
  )
}

/**
 * The listing beside its refinement panel.
 *
 * **The result comes first in the markup and the panel second**, so a narrow
 * screen and a screen reader both reach what was searched for before the twenty
 * ways of narrowing it. A wide screen puts the panel back on the left, which is
 * where a reader of this kind of site looks for it.
 */
export function RefinableList({ panel, children }: {
  panel: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="md:order-first md:w-56 md:shrink-0 lg:w-64">{panel}</div>
    </div>
  )
}

/**
 * Words a first-time reader can try, since nothing in the data suggests any.
 *
 * **Filled rather than outlined, and deliberately not a `Chip`**: an outlined
 * chip means a condition in force and carries the way to lift it. These are
 * examples to press. v1 draws the same distinction.
 *
 * **Small and `soft`**, because they are an aside under the box rather than
 * what the page is asking for: at the size and weight of a button they compete
 * with the two ways in further down.
 */
export function SearchExamples({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="text-ink-muted">{messages.search.examples}</span>
      {messages.search.exampleQueries.map((example) => (
        <ButtonLink
          key={example}
          to={href(locale, listPath("research") + searchQuery({ q: example, sort: null, page: 1 }))}
          variant="soft"
          size="xs"
          pill
        >
          {example}
        </ButtonLink>
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
    <ul className="flex flex-wrap gap-2">
      {conditions.map((condition) => (
        <li key={condition.label}>
          <Chip
            label={condition.label}
            to={condition.href}
            remove={messagesFor(locale).search.exclude}
          />
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="text-ink-muted">{messages.search.sort.label}</span>
      {options.map((option) => (
        <Link
          key={option}
          to={href(locale, listPath(target) + searchQuery({ q: query, sort: option, page: 1 }))}
          aria-current={option === sort ? "true" : undefined}
          className={option === sort ? "font-semibold text-ink" : ""}
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
  return (
    <PageLinks
      label={messages.search.pagination}
      page={page}
      pageCount={pageCount}
      at={(to) => href(locale, listPath(target) + searchQuery({ q: query, sort, page: to }))}
      previous={messages.search.previousPage}
      next={messages.search.nextPage}
    />
  )
}

/**
 * What is shown when nothing matched. No relaxed search is run behind it: the
 * only honest count is of a search somebody asked for.
 */
export function NoResults({ locale, other }: { locale: Locale, other?: React.ReactNode }) {
  const messages = messagesFor(locale)
  return (
    <div className="rounded border border-line bg-surface px-6 py-6">
      <Stack gap="normal">
        <Stack gap="tight">
          <p className="font-semibold">{messages.search.none}</p>
          <p className="text-ink-muted text-sm">{messages.search.noneHint}</p>
          {other !== undefined && <p className="text-sm">{other}</p>}
        </Stack>
        <Stack gap="tight">
          <h2 className="font-semibold text-ink-muted text-xs">{messages.search.syntaxTitle}</h2>
          <Stack gap="tight" as="ul">
            <li className="text-ink-muted text-sm">{messages.search.syntaxSpace}</li>
            <li className="text-ink-muted text-sm">{messages.search.syntaxComma}</li>
            <li className="text-ink-muted text-sm">{messages.search.syntaxQuote}</li>
          </Stack>
        </Stack>
      </Stack>
    </div>
  )
}

export function InvalidQuery({ locale, column }: { locale: Locale, column: number }) {
  const messages = messagesFor(locale)
  return (
    <Note kind="danger">
      {messages.search.invalid}
      {" "}
      <span className="text-ink-muted">{column}</span>
    </Note>
  )
}

/**
 * Handing the results over as a table.
 *
 * **Every row the search matched, not the page being looked at**, which is what
 * v1 exports and the only reading under which "export these results" is true.
 * The file is comma-separated and opens in a spreadsheet; the copy is
 * tab-separated and goes straight into one. There is no third format — writing
 * an actual workbook would mean a dependency for a file every spreadsheet
 * already reads.
 *
 * Copying needs a browser and the address bar cannot do it, so that one is a
 * control; the file is a link, and downloads without any script at all.
 */
function ExportLinks({ locale, target, query, sort }: {
  locale: Locale
  target: "research" | "dataset"
  query: string
  sort: SortKey
}) {
  const messages = messagesFor(locale)
  const [copied, setCopied] = useState(false)
  const at = (format: "copy" | "csv") =>
    `${href(locale, exportPath(target))}?${new URLSearchParams({ format, q: query, sort }).toString()}`

  async function copy() {
    const answer = await fetch(at("copy"))
    await navigator.clipboard.writeText(await answer.text())
    setCopied(true)
    window.setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        pill
        icon={<Icon name="copy" />}
        onClick={() => { void copy() }}
      >
        {copied ? messages.search.exportCopied : messages.search.exportCopy}
      </Button>
      <ButtonLink to={at("csv")} external pill icon={<Icon name="download" />}>
        {messages.search.exportCsv}
      </ButtonLink>
    </div>
  )
}

/**
 * The frame both listings sit in.
 *
 * **They are one screen over two kinds of row.** The box, the panel, the
 * ordering, the page links and the export are the same on both, and the pair of
 * tabs at the top right carries the search from one to the other — which is how
 * v1 presents them and why the two files below hold only their own table.
 */
export function ListingScreen({ view, target, heading, panel, other, empty, children }: {
  view: ListShell
  target: "research" | "dataset"
  /** What this listing is called, which is also where the trail ends. */
  heading: string
  panel: ReactNode
  /** The same search over the other listing, when there is anything there. */
  other?: ReactNode
  /** Whether the table below has any rows at all. */
  empty: boolean
  children: ReactNode
}) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const carry = (which: "research" | "dataset") =>
    href(locale, listPath(which) + searchQuery({ q: view.query, sort: null, page: 1 }))

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-x-4">
        <Crumbs locale={locale} current={heading} />
        <SwitchTabs
          label={messages.search.switchListing}
          tabs={[
            {
              label: messages.search.tabResearch,
              to: carry("research"),
              current: target === "research",
            },
            {
              label: messages.search.tabDataset,
              to: carry("dataset"),
              current: target === "dataset",
            },
          ]}
        />
      </div>

      <Card under={false}>
        <Stack gap="normal">
          <Heading title={heading} count={messages.search.results(view.total)}>
            {/*
              Nothing to hand over when the address could not be read: the query
              the file would carry is the empty one, and that is the whole corpus
              rather than the search on screen.
            */}
            {view.parseError === null && (
              <ExportLinks locale={locale} target={target} query={view.query} sort={view.sort} />
            )}
          </Heading>

          <Stack gap="tight">
            <SearchForm
              locale={locale}
              target={target}
              keyword={view.keyword}
              query={view.query}
              facet={view.facet}
              find={view.find}
            />
            <ConditionChips conditions={view.conditions} locale={locale} />
          </Stack>

          {/* What the cart marks down the first column are for, said once. */}
          <Note>{messages.cart.hint}</Note>

          {view.parseError !== null
            ? <InvalidQuery locale={locale} column={view.parseError.column} />
            : (
                <RefinableList panel={panel}>
                  <Stack gap="normal">
                    <Stack gap="tight">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-ink-muted text-sm">
                          {view.total === 0
                            ? messages.search.results(0)
                            : messages.search.range(view.rangeFrom, view.rangeTo, view.total)}
                        </p>
                        <SortLinks
                          locale={locale}
                          target={target}
                          query={view.query}
                          sort={view.sort}
                          options={view.sortOptions}
                        />
                      </div>
                      {other !== undefined && <p className="text-sm">{other}</p>}
                    </Stack>

                    {empty
                      ? <NoResults locale={locale} other={other} />
                      : (
                          <Stack gap="normal">
                            {children}
                            <Pagination
                              locale={locale}
                              target={target}
                              query={view.query}
                              sort={view.sort}
                              page={view.page}
                              pageCount={view.pageCount}
                            />
                          </Stack>
                        )}
                  </Stack>
                </RefinableList>
              )}
        </Stack>
      </Card>
    </Page>
  )
}
