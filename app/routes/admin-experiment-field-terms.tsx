import { Form, Link } from "react-router"

import {
  TERM_SORT,
  TERM_SORT_KEYS,
  type TermSortKey,
} from "~/admin/catalog"
import {
  catalogAction,
  fieldTermsPage,
  type TermRow,
  type VocabularyView,
} from "~/admin/catalog.server"
import { adminExperimentFieldPath, adminExperimentFieldsPath } from "~/admin/urls"
import { ICD10_SET_CODE } from "~/icd10/codes"
import { AdminBack } from "~/components/admin"
import {
  Badge,
  ButtonLink,
  Chooser,
  CHOOSER_SIDE,
  Confirm,
  Dialog,
  Heading,
  MENU_ITEM,
  MENU_ITEM_HERE,
  Note,
  Stack,
} from "~/components/base"
import {
  Answered,
  Editing,
  Field,
  Result,
  Submit,
  Unsaved,
} from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Code, Empty, ExternalLink, Page, Paging, Table, Td } from "~/components/page"
import { RefinableList, SearchBox, usePaneOpen } from "~/components/search"
import { catalogLabel } from "~/i18n/catalog-label"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { pageTitle } from "~/i18n/title"
import { datasetsUsing, href } from "~/public/urls"
import { PAGE_SIZE, PAGE_SIZES, type PageSize } from "~/search/page-size"

import type { Route } from "./+types/admin-experiment-field-terms"

/**
 * The terms one field draws its values from.
 *
 * **The screen is named after the field, not after the vocabulary.** Every
 * vocabulary belongs to exactly one field, so a screen called 「語彙」 could
 * only ever be answered with "which vocabulary?" — while 「プラットフォームで
 * 選べる語」 says both what is here and what it is for (`admin/urls.ts`).
 *
 * **What the data brings in is editable; what is settled is read.** The
 * vocabularies the portal's structure fixes, and ICD10 — the classification put
 * in whole — open here with nothing to press (`admin/catalog.ts` の
 * `SETTLED_VOCABULARIES`, docs/data-model.md の「ICD10」).
 *
 * **A term in use is merged rather than deleted.** Merging rewrites every
 * value that names the term so it names another term of the same vocabulary,
 * then removes the term; deleting one that is still named would leave a value
 * nobody can render.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const view = await fieldTermsPage(request, params.key)
  if (view === null) throw new Response(null, { status: 404, statusText: "Not Found" })
  return view
}

export async function action({ request }: Route.ActionArgs) {
  return catalogAction(request)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    {
      title: pageTitle(
        messages,
        messages.admin.catalog.termsHeading,
        catalogLabel(loaderData.field, loaderData.locale),
      ),
    },
    { name: "robots", content: "noindex" },
  ]
}

/**
 * The same listing, read another way.
 *
 * **Choosing an order sends the reader back to the first page**: the seventh
 * page of an order nobody has seen yet is not a place anyone asked for. What
 * the box holds is carried through, because an order is a way of reading the
 * answer rather than a different question.
 */
function at(view: VocabularyView, over: {
  sort?: TermSortKey
  order?: "asc" | "desc"
  size?: PageSize
  page?: number
  /** The term a merge aims from; `null` puts the listing back to ordinary. */
  mergeFrom?: string | null
}): string {
  const next = {
    sort: view.sort,
    order: view.order,
    size: view.size,
    page: 1,
    mergeFrom: view.mergeFrom?.id ?? null,
    ...over,
  }
  const search = new URLSearchParams()
  if (view.find !== "") search.set("find", view.find)
  // Carried through the box and the pages: choosing where to fold a term into
  // is reading this listing, and losing the aim on the second page would mean
  // starting over.
  if (next.mergeFrom !== null) search.set("mergeFrom", next.mergeFrom)
  if (next.sort !== TERM_SORT) search.set("sort", next.sort)
  if (next.order !== "asc") search.set("order", next.order)
  if (next.size !== PAGE_SIZE) search.set("size", String(next.size))
  if (next.page !== 1) search.set("page", String(next.page))
  const written = search.toString()
  return href(
    view.locale,
    adminExperimentFieldPath(view.field.code) + (written === "" ? "" : `?${written}`),
  )
}

export default function AdminFieldTerms({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const set = view.set
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()
  const flipped = view.order === "asc" ? "desc" : "asc"
  const turn = flipped === "asc"
    ? messages.search.sort.toAscending
    : messages.search.sort.toDescending

  /*
    How the terms are read, and which of them are on screen.

    **The same row the table of fields carries**, in the same place — the two
    screens are one step apart, and a reader who learned the controls on the
    table should not have to find them again in what it opens.
  */
  const pages = (
    <Paging
      locale={locale}
      total={set.terms}
      from={view.rangeFrom}
      to={view.rangeTo}
      page={view.page}
      pageCount={view.pageCount}
      at={(page) => at(view, { page })}
    />
  )
  const tools = (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
      <Chooser
        label={messages.search.sort.label}
        value={t.sortKeys[view.sort]}
        beside={(
          <Link
            to={at(view, { order: flipped })}
            aria-label={turn}
            title={turn}
            className={CHOOSER_SIDE}
          >
            {/* The glyph says which way the list runs now, not where it goes. */}
            <Icon name={view.order === "asc" ? "sort-asc" : "sort-desc"} aria-hidden="true" />
          </Link>
        )}
      >
        {TERM_SORT_KEYS.map((option) => (
          <Link
            key={option}
            to={at(view, { sort: option, order: "asc" })}
            aria-current={option === view.sort ? "true" : undefined}
            className={option === view.sort ? MENU_ITEM_HERE : MENU_ITEM}
          >
            {t.sortKeys[option]}
          </Link>
        ))}
      </Chooser>
      <Chooser label={messages.search.pageSize} value={String(view.size)}>
        {PAGE_SIZES.map((option) => (
          <Link
            key={option}
            to={at(view, { size: option })}
            aria-current={option === view.size ? "true" : undefined}
            className={option === view.size ? MENU_ITEM_HERE : MENU_ITEM}
          >
            {option}
          </Link>
        ))}
      </Chooser>
      {pages}
    </div>
  )

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        {actionData !== undefined && (
          <Result ok={actionData.status === "ok"}>
            {actionData.status === "ok" ? t.done[actionData.did] : t.problems[actionData.status]}
          </Result>
        )}
      </Answered>
      <Card under={false}>
        <Stack gap="normal">
          {/* **The name says what these are, and the field stands beside it** —
              every vocabulary belongs to exactly one field, so the field is
              which one rather than part of what the screen does.

              **The way to make one stands with the name**, as it does over the
              table of fields: it is the one thing a reader comes here to do
              that is not "open one of these". */}
          {/* The line under the name says what can be done to these values —
              deleting and merging — or, for a settled vocabulary, why nothing
              can: the portal's own vocabularies are fixed by what the portal
              is, ICD10 by being a standard put in whole (docs/data-model.md の
              「ICD10」). It is the same line every screen with a note has, so
              the reason is read where the screen's name is. */}
          <Heading
            title={t.termsHeading}
            aside={catalogLabel(view.field, locale)}
            note={view.editable ? t.termsNote : set.code === ICD10_SET_CODE ? t.standardNote : t.settledNote}
          >
            <AdminBack
              to={href(locale, adminExperimentFieldsPath())}
              label={t.backToList}
              icon="chevron-left"
            />
            {/* **A settled vocabulary has no way in either.** What it holds is
                part of what the portal is, so the screen carries the name and
                the rows and nothing to press. */}
            {view.editable && (
              <Form method="post">
                {/* **Nothing here is unsaved yet**: a panel that makes something
                    has nothing loaded to compare what is typed against, so it is
                    a plain form and the save is the ordinary one (unlike a row's
                    panel, which answers whether there is anything to send). */}
                <input type="hidden" name="setId" value={set.id} />
                <Dialog
                  label={t.addTerm}
                  title={t.addTerm}
                  icon={<Icon name="plus" />}
                  dismiss={t.cancel}
                  action={() => (
                    <Submit intent="create-term" variant="primary" icon={<Icon name="plus" />}>
                      {t.create}
                    </Submit>
                  )}
                >
                  {/* **No code is asked for.** It is made from the English label
                      (`admin/catalog.ts` の `codeFrom`): it is an address the
                      public side carries rather than a name to choose, and
                      asking for one asks the curator to know which characters
                      a query holds unquoted. */}
                  <Field label={t.labelJa} name="labelJa" width="w-full" />
                  <Field label={t.labelEn} name="labelEn" width="w-full" />
                </Dialog>
              </Form>
            )}
          </Heading>

          {/* **Choosing where to fold a term into is reading this listing**, so
              what is in force says so over the rows it changes the meaning of —
              every row's control is now "keep this one" rather than "edit
              this one". The way out stands in the same band as the way in,
              and wears the outlined face: a bare word at the end of the
              sentence reads as its last clause (`docs/ui.md` の「押せるもの」). */}
          {view.mergeFrom !== null && (
            <Note
              kind="warning"
              action={(
                <ButtonLink
                  to={at(view, { mergeFrom: null })}
                  icon={<Icon name="close" aria-hidden="true" />}
                >
                  {t.mergeCancel}
                </ButtonLink>
              )}
            >
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <strong>{t.mergeChoosing(catalogLabel(view.mergeFrom, locale))}</strong>
                <span className="text-sm">{t.mergeChoosingNote}</span>
              </span>
            </Note>
          )}

          <RefinableList
            open={paneOpen}
            busy={busy}
            locale={locale}
            onToggle={togglePane}
            inForce={view.find === "" ? 0 : 1}
            // The box is all the pane holds: a vocabulary has no axis of its own.
            refineHasMore={false}
            refine={<Filters view={view} locale={locale} />}
            tools={tools}
            pages={pages}
            panel={null}
          >
            {view.terms.length === 0
              ? <Empty>{view.find === "" ? t.noTerm : t.noMatchingTerm}</Empty>
              : (
                  <Table
                    align="middle"
                    headers={[
                      /* **The standard's own code leads the row** where the
                         codes are ICD10's: it is what the value is known by,
                         and its prefix is what tells a four-character term
                         from the three-character one above it. Elsewhere a
                         code is an address made from the English label, and
                         nobody reads it. */
                      ...(set.code === ICD10_SET_CODE ? [t.code] : []),
                      t.labelJa,
                      t.labelEn,
                      t.usage,
                      /* The column of things to press names itself for anyone
                         reading the row aloud and nowhere else. */
                      <span key="actions" className="sr-only">{messages.admin.actions}</span>,
                    ]}
                    whenEmpty={t.noMatchingTerm}
                  >
                    {view.terms.map((term) => (
                      <Row
                        key={term.id}
                        term={term}
                        field={view.field.code}
                        showsCode={set.code === ICD10_SET_CODE}
                        editable={view.editable}
                        mergeFrom={view.mergeFrom}
                        mergeAt={(termId) => at(view, { mergeFrom: termId })}
                        locale={locale}
                      />
                    ))}
                  </Table>
                )}
          </RefinableList>
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * The pane: the box.
 *
 * **A GET form, so a narrowed listing has an address that can be kept and
 * shared** — the same rule the table of fields and the public listings follow.
 * **Nothing here waits to be confirmed**: the box asks once the typing has
 * stopped. The ordering and the page size ride along — neither is a condition,
 * but losing them on every search would re-sort and re-cut the listing under
 * the reader.
 */
function Filters({ view, locale }: { view: VocabularyView, locale: Locale }) {
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const to = href(locale, adminExperimentFieldPath(view.field.code))

  return (
    <SearchBox
      action={to}
      name="find"
      value={view.find}
      label={t.find}
      placeholder={messages.search.boxHint}
      submit={t.find}
      size="compact"
      searchAsTyped
    >
      {view.sort !== TERM_SORT && <input type="hidden" name="sort" value={view.sort} />}
      {view.order !== "asc" && <input type="hidden" name="order" value={view.order} />}
      {view.size !== PAGE_SIZE && <input type="hidden" name="size" value={String(view.size)} />}
    </SearchBox>
  )
}

/**
 * One term.
 *
 * **The code stands first and in the face the data is written in.** It is what
 * the value is filed under — a dataset carries the code, and the labels are how
 * a reader recognises which code that is.
 *
 * **What can be pressed is at the end, and what it opens is a panel rather than
 * the row** — the same shape the table of fields uses (`docs/editing.md` の
 * 「解析手法の表」). A row is opened to read it as often as to change it, and
 * one that grows to hold a form leaves the listing a column of boxes of
 * different heights.
 */
function Row({ term, field, showsCode, editable, mergeFrom, mergeAt, locale }: {
  term: TermRow
  /** The code of the field these values belong to, which the address needs. */
  field: string
  /** Whether the term's code is a standard's, and so leads the row. */
  showsCode: boolean
  /** Whether this vocabulary is the administrator's to change at all. */
  editable: boolean
  /** The term a merge is being aimed from, when the address names one. */
  mergeFrom: TermRow | null
  /** Where to go to aim a merge from this row. */
  mergeAt: (termId: string) => string
  locale: Locale
}) {
  const t = messagesFor(locale).admin.catalog

  return (
    <tr>
      {showsCode && <Td nowrap><Code size="xs">{term.code}</Code></Td>}
      {/* **A missing Japanese label is said, not dashed**: the English one is
          always there, so what is missing is the translation, and that is a
          thing to fix rather than a blank in the row (docs/ui.md の
          「壊れるもの」). */}
      <Td floor="min-w-40">
        {term.labelJa ?? <span className="text-ink-muted">{t.untranslated}</span>}
      </Td>
      <Td floor="min-w-40">{term.labelEn}</Td>
      {/* **How many published objects name it**, which is the one thing that
          decides whether it can still be taken away — and the way to see which
          ones they are. **The count goes to the public listing narrowed by this
          value**, because that is where the rows already are; a screen of our
          own would answer the same question from the same rows.

          **It opens a tab of its own.** The curator is in the middle of editing
          a vocabulary, and the answer is something to look at beside that work
          rather than instead of it. */}
      <Td nowrap>
        {term.used === 0
          ? <span className="text-ink-muted">{t.unused}</span>
          : (
              <ExternalLink to={href(locale, datasetsUsing(field, term.code))} locale={locale}>
                {t.usedSearch(term.used)}
              </ExternalLink>
            )}
      </Td>
      {/* **What a row offers depends on what the screen is for right now.** A
          settled vocabulary offers nothing; a listing being read to choose a
          merge's destination offers only that; otherwise the ordinary three. */}
      <Td nowrap holds="control">
        {!editable
          ? null
          : mergeFrom !== null
            ? (
                mergeFrom.id === term.id
                  // The row being folded away cannot be its own destination, and
                  // saying which one it is beats leaving a gap in the column.
                  ? <Badge tone="warning">{t.merge}</Badge>
                  : (
                      <Form method="post">
                        <input type="hidden" name="termId" value={mergeFrom.id} />
                        <input type="hidden" name="intoId" value={term.id} />
                        <Confirm
                          label={t.mergeInto}
                          title={t.mergeTitle(catalogLabel(mergeFrom, locale), catalogLabel(term, locale))}
                          warning={t.mergeWarning}
                          confirm={t.mergeConfirm}
                          cancel={t.cancel}
                          // Not the bin: what is pressed here keeps this row.
                          icon="check"
                          size="row"
                        >
                          <input type="hidden" name="intent" value="merge-term" />
                        </Confirm>
                      </Form>
                    )
              )
            : (
                <span className="flex items-center gap-1">
                  {/* **The save answers what the panel holds**: the labels and
                      whether the value is still offered are one answer to "what
                      should this be now", so they are settled in one press. */}
                  <Editing method="post">
                    <input type="hidden" name="termId" value={term.id} />
                    {/* **Named by the kind of thing in it, not by the row**:
                        the boxes hold the labels and change as typed into
                        (docs/ui.md の「押せるもの」). */}
                    <Dialog
                      label={t.edit}
                      title={t.editTermTitle}
                      size="row"
                      icon={<Icon name="edit" />}
                      dismiss={t.cancel}
                      action={() => (
                        <>
                          <Submit intent="update-term" icon={<Icon name="save" />} saves>
                            {t.save}
                          </Submit>
                          <Unsaved locale={locale} />
                        </>
                      )}
                    >
                      <Field label={t.labelJa} name="labelJa" value={term.labelJa ?? ""} width="w-full" />
                      <Field label={t.labelEn} name="labelEn" value={term.labelEn} width="w-full" />
                    </Dialog>
                  </Editing>
                  {/* **Folding is where a used term goes.** It is offered on
                      every row rather than only on the used ones, because
                      pulling two spellings together is the same operation and
                      neither of them has to be in use. */}
                  <ButtonLink to={mergeAt(term.id)} size="row" icon={<Icon name="merge" />}>
                    {t.mergeStart}
                  </ButtonLink>
                  {/* Going is what cannot be undone, unlike folding, and a
                      term something still points at cannot go. The way in
                      stands on every row and says so on the ones it refuses
                      — the count beside it is of published datasets, and a
                      draft holds a term without any of those. */}
                  <Form method="post">
                    <input type="hidden" name="termId" value={term.id} />
                    <Confirm
                      label={t.remove}
                      title={t.removeTitle(catalogLabel(term, locale))}
                      warning={t.removeTermWarning}
                      confirm={t.removeConfirm}
                      cancel={t.cancel}
                      icon="trash"
                      size="row"
                      disabled={term.inUse ? t.inUseTerm : undefined}
                    >
                      <input type="hidden" name="intent" value="delete-term" />
                    </Confirm>
                  </Form>
                </span>
              )}
      </Td>
    </tr>
  )
}
