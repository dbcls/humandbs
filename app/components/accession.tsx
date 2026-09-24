import { useEffect, useRef, useState } from "react"
import { useFetcher } from "react-router"

import { adminUpstreamDatasetPath } from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import type { action as accessionAction, loader as accessionLoader } from "~/routes/admin-draft-dataset-upstream"

import { Button, Note, Stack } from "./base"
import { Field, Result } from "./form"
import { Icon, Spinner } from "./icons"
import { Section } from "./page"
import { UpstreamChoice } from "./upstream"

/**
 * Adding a dataset to a draft by one accession an archive already holds — a
 * JGAD, found through the application it was registered under, or a DRA
 * submission, which the application system does not hold at all.
 *
 * **A section of the list of datasets, laid open under it.** It is one box and
 * what that box finds, read beside the list it adds to — no screen of its own
 * to leave for, and no panel to open first: the box is where the reader looks
 * when the button would have been. The box looks the accession up without
 * leaving (`GET` on the address the list answers the press from), shows what
 * would be made, and makes it; once a dataset is made the list above is read
 * again and what was found is put away. A refusal stays beside what was
 * refused.
 *
 * **An application is not chosen here.** A branch's datasets come in through
 * the take-in screen's table of this research's branches (docs/editing.md の
 * 「行き先」); a second place to choose a branch would be a second listing of
 * them.
 */
export function AccessionSection({ locale, researchId, draftId, revision }: {
  locale: Locale
  researchId: string
  draftId: string
  /** The draft's revision as the list read it, which a made dataset is checked against. */
  revision: number
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const at = href(locale, adminUpstreamDatasetPath(researchId, draftId))
  const look = useFetcher<typeof accessionLoader>()
  const make = useFetcher<typeof accessionAction>()
  const [made, setMade] = useState(false)

  // A press that made a dataset answers with a way back to the list, which
  // leaves nothing in `data`; a refusal leaves its reason there. Made, what was
  // found is put away until the next lookup.
  const was = useRef(make.state)
  useEffect(() => {
    if (was.current !== "idle" && make.state === "idle" && make.data === undefined) setMade(true)
    was.current = make.state
  }, [make.state, make.data])
  const lookedWas = useRef(look.state)
  useEffect(() => {
    if (lookedWas.current !== "idle" && look.state === "idle") setMade(false)
    lookedWas.current = look.state
  }, [look.state])

  // **A lookup can take a minute** — a DRA submission is asked of the archive
  // itself — so the press has to say it is under way: the button waits with
  // its spinner in place of its mark, and what the last lookup found is put
  // away, since it is no longer the answer to what is in the box.
  const looking = look.state !== "idle"
  const view = made || looking ? undefined : look.data
  const refused = make.data

  return (
    <Section title={t.openDataset}>
      <Stack gap="block">
        <look.Form method="get" action={at} className="flex flex-wrap items-end gap-3">
          {/* **The example is the box's grey word rather than a line under
              it.** A line under the box makes the field taller than the
              button beside it, and a row aligned at its foot then stands the
              button level with the line instead of with the box. */}
          <Field
            label={t.accessionHint}
            name="accession"
            placeholder={t.accessionPlaceholder}
            width="w-64"
          />
          <Button
            type="submit"
            disabled={looking}
            aria-busy={looking || undefined}
            icon={looking ? <Spinner /> : <Icon name="search" />}
          >
            {t.look}
          </Button>
          {looking && <span role="status" className="sr-only">{messages.admin.busy}</span>}
        </look.Form>

        {view?.unknown != null && <Note kind="warning">{t.unknown(view.unknown)}</Note>}
        {refused?.status === "taken" && <Result ok={false}>{t.takenLabel}</Result>}
        {refused?.status === "conflict" && <Result ok={false}>{t.conflict}</Result>}

        {view?.chosen != null && (
          <make.Form method="post" action={at}>
            <input type="hidden" name="revision" value={revision} />
            {view.chosen.applicationId !== null && (
              <input type="hidden" name="application" value={view.chosen.applicationId} />
            )}
            <UpstreamChoice locale={locale} choice={view.chosen} submit={t.add} />
          </make.Form>
        )}
      </Stack>
    </Section>
  )
}
