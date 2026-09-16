import { type SyntheticEvent } from "react"

import { Button, Stack } from "~/components/base"
import { FileField } from "~/components/form"
import { Icon } from "~/components/icons"
import { Section } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

interface AdminAssistantUploadFormProps {
  /**
   * The one file the send needs. **The other two are the chooser's own** — it
   * says what was picked — so only this one is read here, to keep the send
   * closed until there is something to send.
   */
  application: File | null
  busy: boolean
  locale: Locale
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void
  onApplicationChange: (file: File | null) => void
  onEthicsChange: (file: File | null) => void
  onPlanChange: (file: File | null) => void
}

export function AdminAssistantUploadForm({
  application,
  busy,
  locale,
  words,
  onSubmit,
  onApplicationChange,
  onEthicsChange,
  onPlanChange,
}: AdminAssistantUploadFormProps) {
  return (
    <Section title={words.uploadHeading}>
      <form onSubmit={onSubmit}>
        <Stack gap="normal">
          <div className="grid gap-4 sm:grid-cols-3">
            <FileField
              locale={locale}
              label={words.applicationFile}
              name="application"
              accept="application/pdf"
              disabled={busy}
              onChoose={(files) => { onApplicationChange(files[0] ?? null) }}
            />
            <FileField
              locale={locale}
              label={words.ethicsFile}
              name="ethics"
              accept="application/pdf"
              disabled={busy}
              onChoose={(files) => { onEthicsChange(files[0] ?? null) }}
            />
            <FileField
              locale={locale}
              label={words.planFile}
              name="plan"
              accept="application/pdf"
              disabled={busy}
              onChoose={(files) => { onPlanChange(files[0] ?? null) }}
            />
          </div>
          {/* **The button keeps its name while it works.** How far it has got
              is said beside it, where a live region can announce the change
              (`docs/ui.md` の「壊れるもの」). */}
          <div className="flex flex-wrap items-center gap-3">
            {/* **要る 1 つが選ばれるまで送れない。**隠した input に `required`
                を置くと、browser がフォーカスできない相手を指して止まるので、
                要求は画面の側が言う (`components/form.tsx` の `FileField`)。 */}
            <Button
              variant="primary"
              disabled={busy || application === null}
              icon={<Icon name="upload" />}
            >
              {words.upload}
            </Button>
            <span role="status" className="text-ink-muted text-sm">
              {busy ? words.uploading : ""}
            </span>
          </div>
        </Stack>
      </form>
    </Section>
  )
}
