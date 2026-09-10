import { type SyntheticEvent } from "react"

import { Button, Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import { Card, Section } from "~/components/page"
import { messagesFor } from "~/i18n/messages"

interface AdminAssistantUploadFormProps {
  application: File | null
  ethics: File | null
  plan: File | null
  busy: boolean
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void
  onApplicationChange: (file: File | null) => void
  onEthicsChange: (file: File | null) => void
  onPlanChange: (file: File | null) => void
}

export function AdminAssistantUploadForm({
  application,
  ethics,
  plan,
  busy,
  words,
  onSubmit,
  onApplicationChange,
  onEthicsChange,
  onPlanChange,
}: AdminAssistantUploadFormProps) {
  return (
    <Card under={false}>
      <form onSubmit={onSubmit}>
        <Stack>
          <Section title={words.uploadHeading}>
            <div className="grid gap-4 sm:grid-cols-3">
              <FileInput
                label={words.applicationFile}
                required
                file={application}
                disabled={busy}
                onChange={onApplicationChange}
              />
              <FileInput
                label={words.ethicsFile}
                file={ethics}
                disabled={busy}
                onChange={onEthicsChange}
              />
              <FileInput
                label={words.planFile}
                file={plan}
                disabled={busy}
                onChange={onPlanChange}
              />
            </div>
          </Section>
          <div>
            <Button
              variant="primary"
              disabled={busy}
              icon={(
                <Icon
                  name={busy ? "spinner" : "upload"}
                  className={busy ? "animate-spin" : ""}
                />
              )}
            >
              {busy ? words.uploading : words.upload}
            </Button>
          </div>
        </Stack>
      </form>
    </Card>
  )
}

function FileInput({
  label,
  required = false,
  file,
  disabled,
  onChange,
}: {
  label: string
  required?: boolean
  file: File | null
  disabled: boolean
  onChange: (file: File | null) => void
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-semibold text-ink-muted text-xs">{label}</span>
      <input
        type="file"
        accept="application/pdf"
        required={required}
        disabled={disabled}
        onChange={(event) => { onChange(event.target.files?.[0] ?? null) }}
        className="text-sm file:mr-3 file:cursor-pointer file:rounded file:border file:border-brand file:bg-white file:px-3 file:py-1 file:text-brand"
      />
      {file !== null && (
        <span className="truncate text-ink-muted text-xs">{file.name}</span>
      )}
    </label>
  )
}
