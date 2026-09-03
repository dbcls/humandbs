import { Button, Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import { Card, Empty, Table, Td } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import type { Status, Task } from "./admin-assistant-client"

interface AdminAssistantTaskListProps {
  tasks: readonly Task[]
  selectedTaskId: string | undefined
  loading: boolean
  locale: Locale
  words: ReturnType<typeof messagesFor>["admin"]["assistant"]
  onRefresh: () => void
  onSelect: (taskId: string) => void
}

export function AdminAssistantTaskList({
  tasks,
  selectedTaskId,
  loading,
  locale,
  words,
  onRefresh,
  onSelect,
}: AdminAssistantTaskListProps) {
  return (
    <Card under={false}>
      <Stack>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-brand text-lg">
            {words.listHeading}
          </h2>
          <Button
            type="button"
            icon={<Icon name="undo" />}
            disabled={loading}
            onClick={onRefresh}
          >
            {words.refresh}
          </Button>
        </div>
        {loading && tasks.length === 0
          ? <Empty>{words.loading}</Empty>
          : tasks.length === 0
            ? <Empty>{words.none}</Empty>
            : (
                <Table
                  headers={[
                    words.taskId,
                    words.applicationType,
                    words.status,
                    words.updated,
                  ]}
                >
                  {tasks.map((task) => (
                    <tr
                      key={task.task_id}
                      className={
                        selectedTaskId === task.task_id ? "bg-surface-hover" : ""
                      }
                    >
                      <Td nowrap>
                        <button
                          type="button"
                          onClick={() => { onSelect(task.task_id) }}
                          className="cursor-pointer text-left font-mono text-brand underline"
                        >
                          {task.task_id}
                        </button>
                      </Td>
                      <Td>{task.application_type ?? "-"}</Td>
                      <Td>
                        <span className={statusClass(task.status)}>
                          {words.statuses[task.status]}
                        </span>
                      </Td>
                      <Td>{formatTime(task.updated_at ?? task.created_at, locale)}</Td>
                    </tr>
                  ))}
                </Table>
              )}
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
