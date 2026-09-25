import { minuteInJst } from "~/dates"
import { Button, Stack, Chevron } from "~/components/base"
import { Flag, Stated } from "~/components/flags"
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
        {/* **The button that requests again is shown inside the part it reloads**, the way
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
            say what would have been here. */}
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
                {/* The identifier opens the task beside the listing; the indicator
                    says so, where the identifier alone reads as a cell of text. */}
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  icon={<Chevron dir="right" />}
                  onClick={() => { onSelect(task.task_id) }}
                >
                  {task.task_id}
                </Button>
              </Td>
              <Td>{task.application_type}</Td>
              <Td>
                <AssistantStatus status={task.status} locale={locale} />
              </Td>
              <Td>{timeOf(task.updated_at ?? task.created_at)}</Td>
            </tr>
          ))}
        </Table>
      </Stack>
    </Section>
  )
}

/**
 * When a task was made or last moved, written the way every date-time on the
 * management side is (`YYYY-MM-DD HH:MM`, JST). A time the service did not give
 * leaves the cell empty; one it gave unreadable is shown as given.
 */
export function timeOf(value: string | undefined): string {
  if (value === undefined) return ""
  return Number.isNaN(new Date(value).getTime()) ? value : minuteInJst(value)
}

/**
 * Where a task remains, as the listing and the task's own screen both say it.
 *
 * **Every task has a status, so it is a glyph and a word** (`Stated`), and
 * **only a failure is a badge** (`Flag` の `stops`): a finished task is the
 * ordinary outcome and one still queued or running needs nobody, so the one
 * worth acting on is the only one boxed in a colour.
 */
export function AssistantStatus({ status, locale }: { status: Status, locale: Locale }) {
  const word = messagesFor(locale).admin.assistant.statuses[status]
  if (status === "error") return <Flag kind="stops">{word}</Flag>
  return <Stated kind={status === "completed" ? "resolved" : "waiting"}>{word}</Stated>
}
