import { Stack } from "~/components/base"
import { Table, Td } from "~/components/page"

import type {
  AssistantWords,
  ChecklistItem,
  EthicsDocument,
} from "./admin-assistant-model"

export function display(
  value: string | null | undefined,
  words: AssistantWords,
): string {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? words.missing : trimmed
}

export function joinFields(
  japanese: string | null | undefined,
  english: string | null | undefined,
  words: AssistantWords,
): string {
  const values = [japanese, english].filter(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  )
  return values.length === 0 ? words.missing : values.join(" / ")
}

export function range(
  start: string | null | undefined,
  end: string | null | undefined,
  words: AssistantWords,
): string {
  const values = [start, end].filter(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  )
  return values.length === 0 ? words.missing : values.join(" ～ ")
}

export function hasEthicsDocument(document: EthicsDocument): boolean {
  return [
    document.research_project_title_jp,
    document.research_project_title_en,
    document.approval_period_start,
    document.approval_period_end,
    document.institution_name,
    document.institution_head_position,
  ].some((value) => value?.trim())
}

export function planAffiliationMatches(
  value: string | null | undefined,
): boolean | undefined {
  if (value === undefined || value === null) return undefined
  return value === "full_match"
}

export function splitDetail(detail: string): readonly [string, string] {
  const separator = detail.indexOf(": ")
  return separator === -1
    ? [detail, "-"]
    : [detail.slice(0, separator), detail.slice(separator + 2)]
}

export function joined(
  values: readonly string[] | null | undefined,
  separator: string,
): string {
  const value = values?.join(separator)
  return value === undefined || value === "" ? "-" : value
}

export function joinText(
  message: string | null | undefined,
  updated: string | null | undefined,
): string | undefined {
  if (message === undefined && updated === undefined) return undefined
  return [message, updated]
    .filter((value): value is string => value !== undefined && value !== null)
    .join(" ")
}

export function StatusText({
  result,
  words,
}: {
  result: boolean | null | undefined
  words: AssistantWords
}) {
  if (result === true)
    return <span className="text-green-700">{words.verified}</span>
  if (result === false)
    return <span className="text-danger">{words.unverified}</span>
  return <span className="text-warning">-</span>
}

export function ChecklistStatus({
  status,
  words,
}: {
  status: ChecklistItem["status"]
  words: AssistantWords
}) {
  const className
    = status === "ok"
      ? "text-green-700"
      : status === "warning"
        ? "text-warning"
        : "text-danger"
  return (
    <span className={className}>{words.checklistStatuses[status]}</span>
  )
}

export function ExternalLink({
  url,
  words,
  label,
}: {
  url: string | null | undefined
  words: AssistantWords
  label?: string | null
}) {
  const trimmedLabel = label?.trim()
  if (url === undefined || url === null || url.trim() === "")
    return <>{trimmedLabel === undefined || trimmedLabel === "" ? words.missing : trimmedLabel}</>
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="break-all text-brand underline"
    >
      {trimmedLabel === undefined || trimmedLabel === "" ? url : trimmedLabel}
    </a>
  )
}

export function domain(url: string): string {
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}

export function VerificationRow({
  label,
  result,
  message,
  evidence,
  words,
}: {
  label: string
  result: boolean | null | undefined
  message?: string | null
  evidence?: string | null
  words: AssistantWords
}) {
  return (
    <div className="rounded p-2 text-sm">
      <span className="font-semibold">
        {label}
        :
        {" "}
      </span>
      <StatusText result={result} words={words} />
      {message && (
        <span>
          {" "}
          —
          <JudgmentText value={message} />
        </span>
      )}
      {evidence && (
        <>
          {" "}
          <ExternalLink url={evidence} label={words.evidence} words={words} />
        </>
      )}
    </div>
  )
}

export function JudgmentText({ value }: { value: string }) {
  const className
    = /不一致|一致(?:しない|しません|していない|していません)|未確認|確認(?:できない|できません)|NOT\s+OK|(?:^|[^A-Z])NG(?:$|[^A-Z])/iu.test(value)
      ? "text-danger"
      : /一致|確認済み|(?:^|[^A-Z])OK(?:$|[^A-Z])/iu.test(value)
        ? "text-green-700"
        : undefined
  return <span className={className}>{value}</span>
}

export function ValidationChecklist({
  title,
  checks,
  words,
}: {
  title: string
  checks: readonly {
    description: string
    result: boolean | null | undefined
    message?: string | null
    evidence?: string | null
  }[]
  words: AssistantWords
}) {
  if (checks.every((check) => check.result === undefined && !check.message))
    return null
  return (
    <Stack gap="tight">
      <h3 className="font-semibold text-sm">{title}</h3>
      <Table headers={[words.content, words.result, words.message]}>
        {checks.map((check) => (
          <tr key={check.description}>
            <Td>{check.description}</Td>
            <Td>
              <StatusText result={check.result} words={words} />
            </Td>
            <Td>
              {display(check.message, words)}
              {check.evidence && (
                <>
                  {" "}
                  <ExternalLink
                    url={check.evidence}
                    label={words.evidence}
                    words={words}
                  />
                </>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </Stack>
  )
}
