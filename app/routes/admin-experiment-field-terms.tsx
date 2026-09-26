import { useRef, useState } from "react"
import { Form, Link } from "react-router"

import {
  TERM_SORT,
  TERM_SORT_KEYS,
  type TermSortKey,
} from "~/admin/catalog"
import {
  catalogAction,
  fieldTermsPage,
  type TermDocumentOption,
  type TermRow,
  type VocabularyView,
} from "~/admin/catalog.server"
import { adminDocumentPath, adminExperimentFieldPath, adminExperimentFieldsPath } from "~/admin/urls"
import { ICD10_SET_CODE } from "~/icd10/codes"
import { AdminBack } from "~/components/admin"
import {
  ButtonLink,
  Confirm,
  Dialog,
  Heading,
  Note,
  PANE_LABEL,
  Stack,
} from "~/components/base"
import { ComboBox } from "~/components/combobox"
import {
  Answer,
  Editing,
  Field,
  LanguagePair,
  Submit,
  Unsaved,
} from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Code, ExternalLink, Page, Paging, Table, Td } from "~/components/page"
import { type ListingPaging, ListingPresented, ListingTools, type Presentation, type PresentedQuery, presentedQuery, RefinableList, SearchBox, usePaneOpen } from "~/components/search"
import { catalogLabel } from "~/i18n/catalog-label"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { adminWindowTitle } from "~/i18n/title"
import { datasetsUsing, href } from "~/public/urls"

import type { Route } from "./+types/admin-experiment-field-terms"
import { Flag } from "~/components/flags"

/**
 * The terms one field draws its values from.
 *
 * **The screen is named after the field, not after the vocabulary.** Every
 * vocabulary belongs to exactly one field, so a screen called 「語彙」 could
 * only ever be met with "which vocabulary?" — while 「プラットフォームで
 * 選べる語」 shows both what is here and what it is for (`admin/urls.ts`).
 *
 * **What the data brings in is editable; what is settled is read.** The
 * vocabularies the portal's structure fixes, and ICD10 — the classification put
 * in whole — open here with nothing to press (`admin/catalog.ts` の
 * `SETTLED_VOCABULARIES`).
 *
 * **A term in use is merged rather than deleted.** Merging rewrites every
 * value that identifies the term so it identifies another term of the same vocabulary,
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

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    {
      title: adminWindowTitle(
        messages, location.pathname,
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
 * the box holds is kept through, because an order is a way of reading the
 * answer rather than a different question.
 */
function at(view: VocabularyView, over: Partial<PresentedQuery<TermSortKey>> & {
  page?: number
  /** The term a merge aims from; `null` puts the listing back to ordinary. */
  mergeFrom?: string | null
}): string {
  const next = {
    ...presentedQuery(presentation(view)),
    page: 1,
    mergeFrom: view.mergeFrom?.id ?? null,
    ...over,
  }
  const search = new URLSearchParams()
  if (view.find !== "") search.set("find", view.find)
  // Kept through the box and the pages: choosing where to merge a term into
  // is reading this listing, and losing the aim on the second page would mean
  // starting over.
  if (next.mergeFrom !== null) search.set("mergeFrom", next.mergeFrom)
  if (next.sort !== null) search.set("sort", next.sort)
  if (next.order !== null) search.set("order", next.order)
  if (next.size !== null) search.set("size", String(next.size))
  if (next.page !== 1) search.set("page", String(next.page))
  const written = search.toString()
  return href(
    view.locale,
    adminExperimentFieldPath(view.field.code) + (written === "" ? "" : `?${written}`),
  )
}

/** How the terms are read: every key runs from A in the bare address. */
function presentation(view: VocabularyView): Presentation<TermSortKey> {
  const t = messagesFor(view.locale).admin.catalog
  return {
    sort: {
      keys: TERM_SORT_KEYS,
      current: view.sort,
      order: view.order,
      unwritten: TERM_SORT,
      runs: () => "asc",
      name: (key) => t.sortKeys[key],
    },
    size: view.size,
  }
}

export default function AdminFieldTerms({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const set = view.set
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()
  /*
    How the terms are read, and which of them are on screen.

    **The same row the table of fields has**, in the same place — the two
    screens are one step apart, and a reader who learned the controls on the
    table should not have to find them again in what it opens.
  */
  const paging: ListingPaging = {
    total: set.terms,
    from: view.rangeFrom,
    to: view.rangeTo,
    page: view.page,
    pageCount: view.pageCount,
    at: (page) => at(view, { page }),
  }
  const pages = <Paging locale={locale} {...paging} />
  const tools = (
    <ListingTools
      locale={locale}
      presented={presentation(view)}
      at={(presented) => at(view, presented)}
      paging={paging}
    />
  )

  return (
    <Page>
      <Answer
        answer={actionData}
        locale={locale}
        said={(answer) => answer.status === "ok" ? t.done[answer.did] : t.problems[answer.status]}
      />
      <Card under={false}>
        <Stack gap="normal">
          {/* **The name shows what these are, and the field is shown beside it** —
              every vocabulary belongs to exactly one field, so the field is
              which one rather than part of what the screen does.

              **The way to make one is shown with the name**, as it does over the
              table of fields: it is the one thing a reader comes here to do
              that is not "open one of these". */}
          {/* The line under the name shows what can be done to these values —
              deleting and merging — or, for a settled vocabulary, why nothing
              can: the portal's own vocabularies are fixed by what the portal
              is, ICD10 by being a standard put in whole. It is the same line every screen with a note has, so
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
            {/* **A settled vocabulary has no trigger either.** What it holds is
                part of what the portal is, so the screen has the name and
                the rows and nothing to press. */}
            {view.editable && (
              <Form method="post">
                {/* **Nothing here is unsaved yet**: a panel that makes something
                    has nothing loaded to compare what is typed against, so it is
                    a plain form and the save is the ordinary one (unlike a row's
                    panel, which shows whether there is anything to send). */}
                <input type="hidden" name="setId" value={set.id} />
                <Dialog
                  label={t.addTerm}
                  title={t.addTerm}
                  icon={<Icon name="plus" />}
                  action={() => (
                    <Submit intent="create-term" variant="primary" icon={<Icon name="plus" />}>
                      {t.create}
                    </Submit>
                  )}
                >
                  {/* **No code is asked for.** It is made from the English label
                      (`admin/catalog.ts` の `codeFrom`): it is an address the
                      public side has rather than a name to choose, and
                      requesting one requires the curator to know which characters
                      a query holds unquoted. */}
                  <LanguagePair>
                    <Field label={t.labelJa} name="labelJa" width="w-full" />
                    <Field label={t.labelEn} name="labelEn" width="w-full" />
                  </LanguagePair>
                  {view.linksDocuments && <DocumentPicker documents={view.documents} value={null} locale={locale} />}
                </Dialog>
              </Form>
            )}
          </Heading>

          {/* **Choosing where to merge a term into is reading this listing**, so
              what is in force shows it over the rows it changes the meaning of —
              every row's control is now "keep this one" rather than "edit
              this one". The cancel button is shown in the same header row as the trigger,
              and uses the outlined style: a bare word at the end of the
              sentence reads as its last clause. */}
          {view.mergeFrom !== null && (
            <Note
              kind="warning"
              action={(
                <ButtonLink to={at(view, { mergeFrom: null })}>
                  {messages.admin.cancel}
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
            <Table
              actions
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
                ...(view.linksDocuments ? [t.document] : []),
                t.usage,
              ]}
              whenEmpty={view.find === "" ? t.noTerm : t.noMatchingTerm}
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
                  documents={view.linksDocuments ? view.documents : null}
                />
              ))}
            </Table>
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
 * **Nothing here waits to be confirmed**: the field sends the query once the typing has
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
      placeholder={messages.search.searchHint}
      submit={messages.search.submit}
      size="compact"
      searchAsTyped
    >
      {view.mergeFrom !== null && <input type="hidden" name="mergeFrom" value={view.mergeFrom.id} />}
      <ListingPresented presented={presentation(view)} />
    </SearchBox>
  )
}

/**
 * One term.
 *
 * **The code is shown first and in the typeface the data is written in.** It is what
 * the value is filed under — a dataset has the code, and the labels are how
 * a reader recognises which code that is.
 *
 * **What can be pressed is at the end, and what it opens is a panel rather than
 * the row** — the same shape the table of fields uses. A row is opened to
 * read it as often as to change it, and
 * one that grows to hold a form leaves the listing a column of boxes of
 * different heights.
 */
function Row({ term, field, showsCode, editable, mergeFrom, mergeAt, locale, documents }: {
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
  /**
   * Every document on the site, for naming the one this term's label links to,
   * or null in a vocabulary whose terms link to nothing (`DOCUMENT_LINKED_VOCABULARY`).
   */
  documents: readonly TermDocumentOption[] | null
}) {
  const t = messagesFor(locale).admin.catalog
  const linked = term.documentId === null || documents === null
    ? null
    : documents.find((doc) => doc.id === term.documentId) ?? null

  return (
    <tr>
      {showsCode && <Td nowrap><Code size="xs">{term.code}</Code></Td>}
      {/* **A missing Japanese label is an indicator, not a dash**: the English one
          is always there, so what is missing is the translation, and that is a
          thing to fix rather than a blank in the row. */}
      <Td floor="min-w-40">
        {term.labelJa ?? <Flag kind="short">{t.untranslated}</Flag>}
      </Td>
      <Td floor="min-w-40">{term.labelEn}</Td>
      {/* **The article the public page links this term's label to.** Read here as
          a link to the article's own screen, so a curator checking what a term
          points at does not have to open the edit panel first. */}
      {documents !== null && (
        <Td floor="min-w-32">
          {linked === null
            ? <span className="text-ink-muted">{t.documentNone}</span>
            : <Link to={href(locale, adminDocumentPath(linked.id))}>{documentLabel(linked)}</Link>}
        </Td>
      )}
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
                  // The row being merged away cannot be its own destination, and
                  // indicating which one it is beats leaving a gap in the column.
                  ? <Flag kind="merging">{t.merge}</Flag>
                  : (
                      <Form method="post">
                        <input type="hidden" name="termId" value={mergeFrom.id} />
                        <input type="hidden" name="intoId" value={term.id} />
                        <Confirm
                          label={t.mergeInto}
                          title={t.mergeTitle(catalogLabel(mergeFrom, locale), catalogLabel(term, locale))}
                          warning={t.mergeWarning}
                          confirm={t.mergeConfirm}
                          // Not the bin: what is pressed here keeps this row.
                          icon="merge"
                          size="row"
                          intent="merge-term"
                        />
                      </Form>
                    )
              )
            : (
                <span className="flex items-center gap-1">
                  {/* **The save determines what the panel holds**: the labels and
                      whether the value is still offered are one answer to "what
                      should this be now", so they are settled in one press. */}
                  <Editing method="post">
                    <input type="hidden" name="termId" value={term.id} />
                    {/* **Named by the kind of thing in it, not by the row**:
                        the boxes hold the labels and change as typed into. */}
                    <Dialog
                      label={t.edit}
                      title={t.editTermTitle}
                      size="row"
                      icon={<Icon name="edit" />}
                      action={() => (
                        <Submit intent="update-term" icon={<Icon name="save" />} saves>
                          {t.save}
                        </Submit>
                      )}
                      status={<Unsaved locale={locale} />}
                    >
                      <LanguagePair>
                        <Field label={t.labelJa} name="labelJa" value={term.labelJa ?? ""} width="w-full" />
                        <Field label={t.labelEn} name="labelEn" value={term.labelEn} width="w-full" />
                      </LanguagePair>
                      {documents !== null && <DocumentPicker documents={documents} value={term.documentId} locale={locale} />}
                    </Dialog>
                  </Editing>
                  {/* **Merging is where a used term goes.** It is offered on
                      every row rather than only on the used ones, because
                      pulling two spellings together is the same operation and
                      neither of them has to be in use. */}
                  <ButtonLink to={mergeAt(term.id)} size="row" icon={<Icon name="merge" />}>
                    {t.mergeStart}
                  </ButtonLink>
                  {/* Going is what cannot be undone, unlike merging, and a
                      term something still points at cannot go. The trigger
                      is shown on every row and shows it on the ones it refuses
                      — the count beside it is of published datasets, and a
                      draft holds a term without any of those. */}
                  <Form method="post">
                    <input type="hidden" name="termId" value={term.id} />
                    <Confirm
                      label={t.remove}
                      title={t.removeTitle(catalogLabel(term, locale))}
                      warning={t.removeTermWarning}
                      confirm={t.removeConfirm}
                      size="row"
                      disabled={term.inUse ? t.inUseTerm : undefined}
                      intent="delete-term"
                    />
                  </Form>
                </span>
              )}
      </Td>
    </tr>
  )
}

/** A document named by its title, or by its slug where it has none yet. */
function documentLabel(doc: TermDocumentOption): string {
  return doc.title === "" ? doc.slug : `${doc.title} (${doc.slug})`
}

/**
 * The article a term's label links to on the public page, or none. Shared by
 * the panel that makes a term and the one that edits it: the choice travels
 * under the same name either way, so the intent alone decides what else is
 * saved with it (`catalog.server.ts` の `documentIdFrom`).
 *
 * **Typed into and narrowed** (`ComboBox`): the site has about a hundred
 * articles, and a policy's is found by what its title holds (`JGAP`, ポリシー).
 * The box shows the article in force; entering it opens the whole list, and
 * typing narrows it.
 *
 * **The choice is sent in a text field the reader does not see**, not a hidden
 * one, and set the way a keystroke would be: `Editing` counts what a text field
 * holds against what it was drawn with, and leaves hidden fields out
 * (`form.tsx` の `changedIn`), so the save would not know the article changed.
 */
function DocumentPicker({ documents, value, locale }: {
  documents: readonly TermDocumentOption[]
  /** The term's current article, or null when creating one with no article yet. */
  value: string | null
  locale: Locale
}) {
  const t = messagesFor(locale).admin.catalog
  const words = messagesFor(locale).admin.datasetEditor
  const sent = useRef<HTMLInputElement>(null)
  const [find, setFind] = useState("")
  const choices = [
    { value: "", label: t.documentNone },
    ...documents.map((doc) => ({ value: doc.id, label: documentLabel(doc) })),
  ]
  const needle = find.trim().toLowerCase()
  const offered = choices.filter((choice) => choice.label.toLowerCase().includes(needle))
  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className={PANE_LABEL}>{t.document}</span>
      <input ref={sent} type="text" name="documentId" defaultValue={value ?? ""} hidden />
      <ComboBox
        label={t.document}
        placeholder={t.documentFind}
        options={offered}
        keyOf={(choice) => choice.value}
        render={(choice) => <span>{choice.label}</span>}
        empty={t.documentNoMatch}
        words={{ searching: words.searching, count: words.candidateCount }}
        // Entering the box shows every article; only what is typed narrows.
        onQuery={(typedNow, typed) => { setFind(typed ? typedNow : "") }}
        onChoose={(choice) => {
          const field = sent.current
          if (field !== null) {
            field.value = choice.value
            field.dispatchEvent(new Event("input", { bubbles: true }))
          }
          setFind("")
        }}
        kept={(choice) => choice.label}
        initial={choices.find((choice) => choice.value === (value ?? ""))?.label ?? ""}
      />
    </div>
  )
}
