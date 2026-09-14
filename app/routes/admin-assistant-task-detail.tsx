import { type ReactNode } from "react"

import { assistantApiPath } from "~/admin/urls"
import { Button, ButtonLink, Note, Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import { Card, KeyValue, Pairs } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import type { Status, TaskDetail } from "./admin-assistant-model"

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
  const words = messagesFor(locale).admin.assistant
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
    <Card under={false}>
      <Stack>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-brand text-lg">
            {words.detailHeading(detail.task_id)}
          </h2>
          <span className={`${statusClass(detail.status)} text-sm`}>
            {words.statuses[detail.status]}
          </span>
        </div>
        <Pairs>
          <KeyValue title={words.created}>
            {formatTime(detail.created_at, locale)}
          </KeyValue>
          <KeyValue title={words.updated}>
            {formatTime(detail.updated_at, locale)}
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
            icon={<Icon name="undo" />}
          >
            {words.reanalyze}
          </Button>
          {pdf !== null && (
            <ButtonLink to={pdf} external newTab icon={<Icon name="eye" />}>
              {words.openPdf}
            </ButtonLink>
          )}
          {detail.status === "completed" && (
            <>
              <ButtonLink
                to={handout}
                external
                newTab
                icon={<Icon name="eye" />}
              >
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
    </Card>
  )
}

function formatTime(value: string | undefined, locale: Locale): string {
  if (value === undefined) return "-"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(locale === "ja" ? "ja-JP" : "en-GB")
}

function statusClass(status: Status): string {
  if (status === "completed") return "text-ink-muted"
  if (status === "error") return "text-danger"
  if (status === "pending") return "text-warning"
  return "text-brand"
}
