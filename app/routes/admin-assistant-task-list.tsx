import { Button, Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import { Counted, Section, Table, Td } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import type { Status, Task } from "./admin-assistant-model"

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
    <Section title={words.listHeading}>
      <Stack gap="normal">
        {/* **The way to ask again stands inside the part it reloads**, the way
            every other management screen puts an act under the name of what it
            acts on. */}
        <div>
          <Button
            type="button"
            icon={<Icon name="refresh" />}
            disabled={loading}
            onClick={onRefresh}
          >
            {words.refresh}
          </Button>
        </div>
        {/* **The table stays when there is nothing in it**: the column names
            say what would have been here (`docs/ui.md` の「壊れるもの」). */}
        <Counted locale={locale} total={tasks.length} />
        <Table
          headers={[
            words.taskId,
            words.applicationType,
            words.status,
            words.updated,
          ]}
          whenEmpty={loading ? words.loading : words.none}
        >
          {tasks.map((task) => (
            <tr
              key={task.task_id}
              className={
                selectedTaskId === task.task_id ? "bg-surface-hover" : ""
              }
            >
              <Td nowrap>
                {/* The identifier opens the task beside the listing; the mark
                    says so, where the identifier alone reads as a cell of text. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  icon={<Icon name="chevron-right" aria-hidden="true" />}
                  onClick={() => { onSelect(task.task_id) }}
                >
                  {task.task_id}
                </Button>
              </Td>
              <Td>{task.application_type}</Td>
              <Td>
                <span className={statusClass(task.status)}>
                  {words.statuses[task.status]}
                </span>
              </Td>
              <Td>{formatTime(task.updated_at ?? task.created_at, locale)}</Td>
            </tr>
          ))}
        </Table>
      </Stack>
    </Section>
  )
}

function formatTime(value: string | undefined, locale: Locale): string {
  if (value === undefined) return "-"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(locale === "ja" ? "ja-JP" : "en-GB")
}

/**
 * **Only a state worth acting on carries a colour.** A finished task is the
 * ordinary outcome, so it is drawn in the ordinary way; what is still running
 * is quiet, and what stopped is the one thing to look at.
 */
function statusClass(status: Status): string {
  if (status === "error") return "text-danger"
  if (status === "pending" || status === "processing") return "text-ink-muted"
  return ""
}
