import { PaneHeading, Stack } from "~/components/base"
import { ExternalLink, Table, Td } from "~/components/page"

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

/**
 * Whether one check passed.
 *
 * **Only what did not pass has a colour.** A report is read to find the
 * things to look at, and a page where every answer is coloured has nothing
 * standing out on it — which is also why the site keeps no colour for "this is
 * fine".
 */
export function StatusText({
  result,
  words,
}: {
  result: boolean | null | undefined
  words: AssistantWords
}) {
  if (result === true) return <span>{words.verified}</span>
  if (result === false)
    return <span className="text-danger">{words.unverified}</span>
  // Not checked: nothing to report, so nothing is drawn.
  return null
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
      ? ""
      : status === "warning"
        ? "text-warning"
        : "text-danger"
  return (
    <span className={className}>{words.checklistStatuses[status]}</span>
  )
}

/**
 * An address the service reported, opened in a new tab with the site's own
 * icon and words for that (`page.tsx` の `ExternalLink`); without one, its
 * label or the word for a missing value.
 */
export function LinkedValue({
  url,
  words,
  label,
}: {
  url: string | null | undefined
  words: AssistantWords
  label?: string | null
}) {
  const trimmedLabel = label?.trim()
  const shown = trimmedLabel === undefined || trimmedLabel === "" ? undefined : trimmedLabel
  if (url === undefined || url === null || url.trim() === "") return <>{shown ?? words.missing}</>
  // The management area is Japanese only, so the words for a new tab are too.
  return <ExternalLink to={url} locale="ja">{shown ?? url}</ExternalLink>
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
          <LinkedValue url={evidence} label={words.evidence} words={words} />
        </>
      )}
    </div>
  )
}

/**
 * A sentence the service wrote about one comparison.
 *
 * **What went wrong is marked and what went right is not**, the same way round
 * as `StatusText`. The pattern has to catch the negative forms of the words it
 * also matches — 「一致しません」 holds 「一致」 — so it is written as the
 * refusals rather than as a pair of tests.
 */
export function JudgmentText({ value }: { value: string }) {
  const wrong
    = /不一致|一致(?:しない|しません|していない|していません)|未確認|確認(?:できない|できません)|NOT\s+OK|(?:^|[^A-Z])NG(?:$|[^A-Z])/iu
  return <span className={wrong.test(value) ? "text-danger" : undefined}>{value}</span>
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
      <PaneHeading title={title} level="h3" rule="start" />
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
                  <LinkedValue
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
