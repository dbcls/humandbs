import { type ReactNode } from "react"

import { assistantApiPath } from "~/admin/urls"
import { Button, ButtonLink, Note, Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import { KeyValue, Pairs, Section } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import type { TaskDetail } from "./admin-assistant-model"
import { AssistantStatus, timeOf } from "./admin-assistant-task-list"

interface AdminAssistantTaskDetailProps {
  detail: TaskDetail
  locale: Locale
  busy: boolean
  onReanalyze: () => void
  children: ReactNode
}

export function AdminAssistantTaskDetail({
  detail,
  locale,
  busy,
  onReanalyze,
  children,
}: AdminAssistantTaskDetailProps) {
  const messages = messagesFor(locale)
  const words = messages.admin.assistant
  const pdf
    = detail.filename === undefined
      ? null
      : assistantApiPath(`uploads/${encodeURIComponent(detail.filename)}`)
  const handout = assistantApiPath(
    `applications/${encodeURIComponent(detail.task_id)}/handout`,
  )
  const word = assistantApiPath(
    `applications/${encodeURIComponent(detail.task_id)}/handout/word`,
  )
  return (
    <Section title={words.detailHeading(detail.task_id)}>
      <Stack gap="normal">
        <p className="text-sm">
          <AssistantStatus status={detail.status} locale={locale} />
        </p>
        <Pairs>
          <KeyValue title={words.created}>
            {timeOf(detail.created_at)}
          </KeyValue>
          <KeyValue title={words.updated}>
            {timeOf(detail.updated_at)}
          </KeyValue>
        </Pairs>
        {detail.message !== undefined && <Note>{detail.message}</Note>}
        {detail.error !== undefined && (
          <Note kind="danger">{detail.error}</Note>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={
              busy
              || detail.status === "processing"
              || detail.status === "pending"
            }
            onClick={onReanalyze}
            icon={<Icon name="refresh" />}
          >
            {words.reanalyze}
          </Button>
          {pdf !== null && (
            <ButtonLink to={pdf} external newTab newTabLabel={messages.newTab}>
              {words.openPdf}
            </ButtonLink>
          )}
          {detail.status === "completed" && (
            <>
              <ButtonLink to={handout} external newTab newTabLabel={messages.newTab}>
                {words.handout}
              </ButtonLink>
              <ButtonLink to={word} external icon={<Icon name="download" />}>
                {words.downloadWord}
              </ButtonLink>
            </>
          )}
        </div>
        {children}
      </Stack>
    </Section>
  )
}
