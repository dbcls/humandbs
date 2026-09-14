import { Stack } from "~/components/base"
import { KeyValue, Pairs, Section, Table, Td } from "~/components/page"

import type {
  AssessmentData,
  AssistantWords,
  ChecklistItem,
  ResearchPlanValidation,
} from "./admin-assistant-model"
import {
  ChecklistStatus,
  display,
  ExternalLink,
  joined,
  JudgmentText,
  splitDetail,
  VerificationRow,
} from "./admin-assistant-report-primitives"

export function ConsistencyReport({
  title,
  result,
  people,
  words,
}: {
  title: string
  result:
    | {
      all_match?: boolean | null
      summary?: string
      details?: string[] | null
      head_phone_is_different_from_others?: boolean | null
      head_phone_is_representative_number?: boolean | null
      head_phone_difference_message?: string | null
    }
    | null
    | undefined
  people: readonly (readonly [string, string | null | undefined])[]
  words: AssistantWords
}) {
  if (result === null || result === undefined) return null
  return (
    <Section title={title}>
      <Stack gap="tight">
        <Pairs>
          {people.map(([label, value]) => (
            <KeyValue key={label} title={label}>
              {display(value, words)}
            </KeyValue>
          ))}
        </Pairs>
        <VerificationRow
          label={words.result}
          result={result.all_match}
          message={result.summary}
          words={words}
        />
        {result.details !== undefined && result.details !== null && (
          <Table headers={[words.consistencyComparison, words.result]}>
            {result.details.map((detail, index) => {
              const [comparison, outcome] = splitDetail(detail)
              return (
                <tr key={`${comparison}-${index}`}>
                  <Td>{comparison}</Td>
                  <Td><JudgmentText value={outcome} /></Td>
                </tr>
              )
            })}
          </Table>
        )}
        {result.head_phone_is_different_from_others === false && (
          <VerificationRow
            label={words.headPhoneWarning}
            result={result.head_phone_is_representative_number}
            message={result.head_phone_difference_message}
            words={words}
          />
        )}
      </Stack>
    </Section>
  )
}

export function Checklist({
  title,
  items,
  words,
}: {
  title: string
  items: ChecklistItem[] | undefined
  words: AssistantWords
}) {
  if (items === undefined || items.length === 0) return null
  return (
    <Section title={title}>
      <Table headers={[words.content, words.result, words.message]}>
        {items.map((item, index) => (
          <tr key={`${item.description}-${index}`}>
            <Td>{item.description}</Td>
            <Td>
              <ChecklistStatus status={item.status} words={words} />
            </Td>
            <Td>{display(item.message, words)}</Td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}

export function Papers({
  papers,
  words,
}: {
  papers: AssessmentData["papers"]
  words: AssistantWords
}) {
  if (papers === undefined || papers.length === 0) return null
  return (
    <Section title={words.papers}>
      <Table
        headers={[
          words.title,
          words.summary,
          words.icd10,
          words.paperUrl,
          words.humanData,
        ]}
      >
        {papers.map((paper, index) => (
          <tr key={`${paper.title}-${index}`}>
            <Td>{paper.title}</Td>
            <Td>{paper.summary_jp ?? "-"}</Td>
            <Td>{joined(paper.icd10_code_list, ", ")}</Td>
            <Td>
              <ExternalLink url={paper.url} words={words} />
            </Td>
            <Td>
              <Stack gap="tight">
                <span>
                  {paper.handles_human_data === true
                    ? words.handlesHumanData
                    : paper.handles_human_data === false
                      ? words.doesNotHandleHumanData
                      : words.undecided}
                </span>
                {paper.human_data_reason && (
                  <p className="text-sm">{paper.human_data_reason}</p>
                )}
                {paper.human_data_evidence && (
                  <blockquote className="border-line border-l-2 pl-2 text-ink-muted text-sm">
                    {paper.human_data_evidence}
                  </blockquote>
                )}
              </Stack>
            </Td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}

export function PlanNotes({
  result,
  words,
}: {
  result: ResearchPlanValidation
  words: AssistantWords
}) {
  const notes = [
    [words.publicDatabaseUse, result.public_db_use_description],
    [words.dataRetention, result.data_retention_description],
    [words.outsourcing, result.outsourcing_description],
    [words.cloudUse, result.cloud_use_description],
  ] as const
  return (
    <Stack gap="tight">
      <h3 className="font-semibold text-sm">{words.researchPlanNotes}</h3>
      <Table headers={[words.content, words.present, words.content]}>
        {notes.map(([label, content]) => (
          <tr key={label}>
            <Td>{label}</Td>
            <Td>
              {content !== undefined && content !== null && content.length > 0
                ? words.yes
                : words.no}
            </Td>
            <Td>
              {content?.map((line, index) => (
                <p key={`${line}-${index}`}>
                  •
                  {line}
                </p>
              )) ?? "-"}
            </Td>
          </tr>
        ))}
      </Table>
    </Stack>
  )
}
