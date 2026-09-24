import { data, Form } from "react-router"

import {
  adminResearchFilesPath,
  adminResearchPath,
  boxQuery,
  fileUploadPath,
  type BoxListingQuery,
} from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import {
  Heading,
  Note,
  Stack,
} from "~/components/base"
import { BoxTable, UploadPanel } from "~/components/files"
import { Answer, Checkbox } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Paging } from "~/components/page"
import { DateRange, type ListingPaging, ListingPresented, ListingTools, type Presentation, presentedQuery, RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import { BOX_SORT, BOX_SORT_KEYS, BOX_STATES, type BoxSortKey, type BoxState } from "~/files/box"
import { filesAction, filesPage, type FilesPageView } from "~/files/pages.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { adminWindowTitle } from "~/i18n/title"
import { href, readLocale } from "~/public/urls"
import { dateWindows } from "~/search/date-window"
import { useAsk } from "~/search-as-typed"

import type { Route } from "./+types/admin-research-files"

/**
 * The research's box.
 *
 * **It is not under a draft.** The box belongs to the research, holds no
 * versions, and making a file public is a separate operation from publishing a
 * version — putting it inside a draft would say the two happen together
 * (docs/files.md の「画面」).
 *
 * **It reads the way the `common/` box reads**: the way in over the table, the
 * pane beside it, the tools over it and the pages under it, and every act on
 * the row it acts on. What this box has that the other has not is a second
 * side of the store, so the pane has one axis more and each row has a switch —
 * queued rather than done, since a copy across buckets moves the actual bytes.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return filesPage(request, locale, params.researchId)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await filesAction(request, locale, params.researchId)
  return result instanceof Response ? result : data(result, { status: 400 })
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.files.heading, loaderData.humLabel) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearchFiles({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.files
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()
  // Folded, the way back into the pane says how much is in force. **The two
  // ends of the range are one condition**, and so are the sides picked.
  const inForce = (view.keyword === "" ? 0 : 1)
    + (view.from === null && view.to === null ? 0 : 1)
    + (view.states.length === 0 ? 0 : 1)

  return (
    <Page>
      {/* Only a refusal is answered: publishing, taking down and deleting all
          come back as the box they changed. */}
      <Answer
        answer={actionData}
        locale={locale}
        said={(answer) => {
          switch (answer.status) {
            case "nothing-selected": return t.nothingSelected
            case "no-box": return t.publishNeedsLabel
            case "malformed-name": return t.malformedName
            case "name-taken": return t.nameTaken
            case "switching": return t.renameSwitching
            default: return null
          }
        }}
      />
      {/* **節を 1 つも持たない画面なので、h1 の下は節と節の距離ではない**
          (`docs/ui.md` の「縦の間隔」) — `common/` の箱と同じ。 */}
      <Card under={false}>
        <Stack gap="normal">
          <Heading title={t.heading} aside={view.humLabel ?? undefined} note={t.note}>
            <AdminBack
              to={href(locale, adminResearchPath(view.researchId))}
              label={t.backToResearch}
              icon="chevron-left"
            />
          </Heading>

          {/* Not an answer but a standing fact about this research: it stays on
              the screen (`docs/ui.md` の「管理画面の枠」). */}
          {view.humLabel === null && <Note kind="warning">{t.noBox}</Note>}

          <UploadPanel
            locale={locale}
            endpoint={fileUploadPath(view.researchId)}
            threshold={view.multipartThreshold}
            partSize={view.partSize}
          />

          {/* The store did not answer, which is not the same as an empty box —
              so it is said as a failure rather than in the place a reason for
              nothing goes. */}
          {view.rows === null
            ? <Note kind="danger">{t.unavailable}</Note>
            : (
                <RefinableList
                  open={paneOpen}
                  busy={busy}
                  locale={locale}
                  onToggle={togglePane}
                  inForce={inForce}
                  // The box is never alone in the pane here: the days and the
                  // sides stand under it whatever the reader has asked for.
                  refineHasMore
                  refine={<Filters view={view} locale={locale} />}
                  tools={(
                    <ListingTools
                      locale={locale}
                      presented={presentation(view, locale)}
                      at={(presented) => at(view, presented)}
                      paging={paging(view)}
                    />
                  )}
                  pages={<Paging locale={locale} {...paging(view)} />}
                  panel={null}
                >
                  <BoxTable
                    locale={locale}
                    rows={view.rows}
                    humLabel={view.humLabel}
                    selectedBy={view.selectedBy}
                    whenEmpty={inForce === 0 ? t.empty : t.noMatch}
                  />
                </RefinableList>
              )}
        </Stack>
      </Card>
    </Page>
  )
}

interface ViewProps {
  view: FilesPageView
  locale: Locale
}

/**
 * This box under a different setting.
 *
 * **What is at its default is left out of the address** (`admin/urls.ts` の
 * `boxQuery`), and **changing anything but the page goes back to the first
 * one** — the two rules every listing keeps.
 */
function at(view: FilesPageView, over: Partial<BoxListingQuery>): string {
  return href(view.locale, adminResearchFilesPath(view.researchId) + boxQuery({
    keyword: view.keyword,
    from: view.from,
    to: view.to,
    states: view.states,
    page: 1,
    ...presentedQuery(presentation(view, view.locale)),
    ...over,
  }))
}

/**
 * GET forms, so a narrowed box has an address that can be kept and shared —
 * the rule every listing follows.
 *
 * **Nothing here waits to be confirmed.** The box asks once the typing has
 * stopped, a window or a tick asks as it is pressed, and a day asks the moment
 * it is whole.
 *
 * **The box, the days and the sides are three forms, and each carries what the
 * others hold**, because a form cannot stand inside another.
 */
function Filters({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const t = messages.admin.files
  const to = href(locale, adminResearchFilesPath(view.researchId))
  const { form, ask } = useAsk(to)
  // The same four windows the public dates offer, opening from today and
  // lifting only the days — the words typed and the sides picked stay in force.
  const windows = dateWindows({
    today: view.today,
    from: view.from,
    to: view.to,
    labels: { all: messages.search.refine.presetAll, years: messages.search.refine.presetYears },
    lifted: at(view, { from: null, to: null }),
    opening: (from) => at(view, { from, to: null }),
  })

  return (
    <Stack gap="normal">
      <SearchBox
        action={to}
        name="q"
        value={view.keyword}
        label={t.find}
        placeholder={messages.search.boxHint}
        submit={messages.search.submit}
        size="compact"
        searchAsTyped
      >
        {view.from !== null && <input type="hidden" name="from" value={view.from} />}
        {view.to !== null && <input type="hidden" name="to" value={view.to} />}
        <Sides view={view} />
        <ListingPresented presented={presentation(view, locale)} />
      </SearchBox>

      {/* **The day is the one the column shows** — the JST day the file was
          written — so a range set against the days a reader can read keeps
          exactly the rows they can see fall inside it (`files/box.ts` の
          `narrowedBox`). Either end may be left open. */}
      <RefineAxis label={t.updatedAt}>
        <DateRange locale={locale} action={to} windows={windows} from={view.from ?? ""} to={view.to ?? ""}>
          <input type="hidden" name="q" value={view.keyword} />
          <Sides view={view} />
          <ListingPresented presented={presentation(view, locale)} />
        </DateRange>
      </RefineAxis>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <input type="hidden" name="q" value={view.keyword} />
        {view.from !== null && <input type="hidden" name="from" value={view.from} />}
        {view.to !== null && <input type="hidden" name="to" value={view.to} />}
        <ListingPresented presented={presentation(view, locale)} />
        <RefineAxis label={t.state}>
          {BOX_STATES.map((state: BoxState) => (
            <Checkbox
              key={state}
              label={state === "public" ? t.isPublic : t.isPrivate}
              icon={<Icon name={state === "public" ? "eye" : "lock"} />}
              name="state"
              value={state}
              checked={view.states.includes(state)}
              count={view.counts[state]}
            />
          ))}
        </RefineAxis>
      </Form>
    </Stack>
  )
}

/** The sides picked, carried across a change of the other conditions. */
function Sides({ view }: { view: FilesPageView }) {
  return (
    <>
      {view.states.map((state) => (
        <input key={state} type="hidden" name="state" value={state} />
      ))}
    </>
  )
}

/**
 * How the box is read: in what order and how much of it at a time — the same
 * tools the research listing carries, in the same place and the same shape.
 * Every key runs from its smallest end in the bare address.
 */
function presentation(view: FilesPageView, locale: Locale): Presentation<BoxSortKey> {
  const t = messagesFor(locale).admin.files
  // The box names its own columns, so the orders are named by them rather than
  // by a second set of words meaning the same three things.
  const names: Record<BoxSortKey, string> = { slug: t.name, size: t.size, updated: t.updatedAt }
  return {
    sort: {
      keys: BOX_SORT_KEYS,
      current: view.sort,
      order: view.order,
      unwritten: BOX_SORT,
      runs: () => "asc",
      name: (key) => names[key],
    },
    size: view.size,
  }
}

/** The count and the way through the pages, over the table and again under it. */
function paging(view: FilesPageView): ListingPaging {
  return {
    total: view.total,
    from: view.rangeFrom,
    to: view.rangeTo,
    page: view.page,
    pageCount: view.pageCount,
    at: (page) => at(view, { page }),
  }
}
