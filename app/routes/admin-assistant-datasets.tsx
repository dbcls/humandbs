import { useState, type SyntheticEvent } from "react"

import { Fold, Stack } from "~/components/base"
import { Empty, KeyValue, Pairs, Section, Table, Td } from "~/components/page"

import type {
  AssessmentData,
  AssistantWords,
  DatasetAnalysis,
} from "./admin-assistant-model"
import {
  display,
  ExternalLink,
  joined,
} from "./admin-assistant-report-primitives"

export function datasetIds(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/u).map((id) => id.trim()).filter(Boolean))]
}

export function Datasets({
  datasets,
  requestedDatasets,
  policies,
  applicationMethod,
  paperMethods,
  abstractIcd10,
  paperIcd10,
  canManage,
  busy,
  onAddDatasets,
  onRemoveDataset,
  words,
}: {
  datasets: AssessmentData["dataset_analysis_list"]
  requestedDatasets: AssessmentData["dataset_info_list"]
  policies: AssessmentData["dataset_policy_groups"]
  applicationMethod: string | null | undefined
  paperMethods: string[] | null | undefined
  abstractIcd10: string[] | null | undefined
  paperIcd10: string[] | null | undefined
  canManage: boolean
  busy: boolean
  onAddDatasets: (ids: string[]) => Promise<boolean>
  onRemoveDataset: (datasetId: string) => void
  words: AssistantWords
}) {
  const [newDatasetIds, setNewDatasetIds] = useState("")
  if (datasets === undefined) return null
  const policyGroups
    = policies !== undefined && policies.length > 0
      ? policies
      : datasets.some((dataset) => dataset.found_in_database !== false)
        ? [{
            dataset_ids: datasets
              .filter((dataset) => dataset.found_in_database !== false)
              .map((dataset) => dataset.id),
            policy_text: "",
          }]
        : []
  const add = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    const ids = datasetIds(newDatasetIds)
    if (ids.length === 0) return
    if (await onAddDatasets(ids)) setNewDatasetIds("")
  }
  return (
    <Section title={words.datasets}>
      <Stack>
        {canManage && (
          <form onSubmit={(event) => { void add(event) }} className="rounded border border-border p-4">
            <Stack gap="tight">
              <label htmlFor="assistant-dataset-ids" className="block font-semibold text-sm">
                {words.addDatasets}
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="assistant-dataset-ids"
                  value={newDatasetIds}
                  onChange={(event) => { setNewDatasetIds(event.target.value) }}
                  placeholder={words.datasetIdsPlaceholder}
                  disabled={busy}
                  className="min-w-64 flex-1 rounded border border-border px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || datasetIds(newDatasetIds).length === 0}
                  className="cursor-pointer rounded border border-brand px-3 py-2 text-brand text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? words.addingDatasets : words.add}
                </button>
              </div>
              <p className="text-ink-muted text-xs">{words.datasetIdsHint}</p>
            </Stack>
          </form>
        )}
        {datasets.length === 0
          ? (
              <Empty>{words.noDatasets}</Empty>
            )
          : (
              <>
                <Table
                  headers={[
                    words.datasetId,
                    words.humId,
                    words.jgasId,
                    words.icd10,
                    words.researchIcd10,
                    words.paperIcd10,
                    words.analysis,
                    ...(canManage ? [""] : []),
                  ]}
                >
                  {datasets.map((dataset) => (
                    <DatasetRow
                      key={dataset.id}
                      dataset={dataset}
                      canManage={canManage}
                      busy={busy}
                      onRemove={() => {
                        if (window.confirm(words.removeDatasetConfirm(dataset.id)))
                          onRemoveDataset(dataset.id)
                      }}
                      words={words}
                    />
                  ))}
                </Table>
                {datasets.map((dataset) => (
                  <DatasetDetails
                    key={`${dataset.id}-details`}
                    dataset={dataset}
                    requestedPurpose={
                      requestedDatasets?.find(
                        (requested) => requested.dataset_id === dataset.id,
                      )?.purpose
                    }
                    applicationMethod={applicationMethod}
                    paperMethods={paperMethods}
                    abstractIcd10={abstractIcd10}
                    paperIcd10={paperIcd10}
                    policyTexts={policyGroups
                      .filter((policy) => policy.dataset_ids.includes(dataset.id))
                      .map((policy) => policy.policy_text)}
                    words={words}
                  />
                ))}
              </>
            )}
      </Stack>
    </Section>
  )
}

function DatasetRow({
  dataset,
  canManage,
  busy,
  onRemove,
  words,
}: {
  dataset: DatasetAnalysis
  canManage: boolean
  busy: boolean
  onRemove: () => void
  words: AssistantWords
}) {
  if (dataset.found_in_database === false) {
    return (
      <tr>
        <Td>{dataset.id}</Td>
        <Td colSpan={6}>{words.notRegistered}</Td>
        {canManage && (
          <Td>
            <button type="button" disabled={busy} onClick={onRemove} className="cursor-pointer text-danger text-xs underline">
              {words.removeDataset}
            </button>
          </Td>
        )}
      </tr>
    )
  }
  const retrieval = dataset.dataset_api_retrieval_result
  return (
    <tr>
      <Td>
        <ExternalLink url={dataset.url} label={dataset.id} words={words} />
      </Td>
      <Td>
        <SourceValue
          primary={retrieval?.hum_id}
          secondary={retrieval?.hum_id_list_from_ddbj}
          words={words}
        />
      </Td>
      <Td>
        <SourceValue
          primary={retrieval?.study_id_list}
          secondary={retrieval?.study_id_list_from_ddbj}
          words={words}
        />
      </Td>
      <Td>{joined(dataset.icd10_code_list, ", ")}</Td>
      <Td>{joined(dataset.purpose_similarity_icd10, " / ")}</Td>
      <Td>{joined(dataset.paper_similarity_icd10, " / ")}</Td>
      <Td>{display(dataset.analysis_method_similarity, words)}</Td>
      {canManage && (
        <Td>
          <button type="button" disabled={busy} onClick={onRemove} className="cursor-pointer text-danger text-xs underline">
            {words.removeDataset}
          </button>
        </Td>
      )}
    </tr>
  )
}

function SourceValue({
  primary,
  secondary,
  words,
}: {
  primary: string | string[] | null | undefined
  secondary: string[] | null | undefined
  words: AssistantWords
}) {
  const primaryAvailable = primary !== undefined && primary !== null
  const secondaryAvailable = secondary !== undefined && secondary !== null
  const primaryValues = (
    typeof primary === "string" ? [primary] : (primary ?? [])
  ).filter((value) => value.trim() !== "")
  const secondaryValues = (secondary ?? []).filter(
    (value) => value.trim() !== "",
  )
  const mismatch
    = primaryAvailable
      && secondaryAvailable
      && [...primaryValues].sort().join("\u0000")
      !== [...secondaryValues].sort().join("\u0000")
  if (!mismatch)
    return <>{primaryValues.join(", ") || secondaryValues.join(", ") || "-"}</>
  return (
    <span>
      <strong className="text-danger">{words.sourceMismatch}</strong>
      <br />
      HumanDBs:
      {" "}
      {primaryValues.join(", ") || "-"}
      <br />
      DDBJ:
      {" "}
      {secondaryValues.join(", ") || "-"}
    </span>
  )
}

function DatasetDetails({
  dataset,
  requestedPurpose,
  applicationMethod,
  paperMethods,
  abstractIcd10,
  paperIcd10,
  policyTexts,
  words,
}: {
  dataset: DatasetAnalysis
  requestedPurpose: string | null | undefined
  applicationMethod: string | null | undefined
  paperMethods: string[] | null | undefined
  abstractIcd10: string[] | null | undefined
  paperIcd10: string[] | null | undefined
  policyTexts: string[]
  words: AssistantWords
}) {
  return (
    <Fold summary={`${words.datasetId}: ${dataset.id}`} open>
      <Pairs>
        <KeyValue title={words.requestedPurpose}>
          {display(requestedPurpose, words)}
        </KeyValue>
        <KeyValue title={words.analysis}>
          <DatasetComparison
            datasetValue={joinedOrMissing(dataset.analysis_method_list, words)}
            applicationValue={display(applicationMethod, words)}
            applicationResult={display(dataset.analysis_method_similarity, words)}
            applicationReason={dataset.analysis_method_similarity_reason}
            paperValue={joinedOrMissing(paperMethods, words)}
            paperResult={display(dataset.paper_similarity, words)}
            paperReason={dataset.paper_similarity_reason}
            words={words}
          />
        </KeyValue>
        <KeyValue title="ICD10">
          <DatasetComparison
            datasetValue={joinedOrMissing(dataset.icd10_code_list, words)}
            applicationValue={joinedOrMissing(abstractIcd10, words)}
            applicationResult={joinedOrMissing(dataset.purpose_similarity_icd10, words)}
            paperValue={joinedOrMissing(paperIcd10, words)}
            paperResult={joinedOrMissing(dataset.paper_similarity_icd10, words)}
            words={words}
          />
        </KeyValue>
        <KeyValue title={words.policies}>
          {policyTexts.length === 0
            ? words.missing
            : policyTexts.map((policyText, index) => (
                <p key={`${policyText}-${index}`} className="whitespace-pre-wrap">
                  {policyText}
                </p>
              ))}
        </KeyValue>
      </Pairs>
    </Fold>
  )
}

function DatasetComparison({
  datasetValue,
  applicationValue,
  applicationResult,
  applicationReason,
  paperValue,
  paperResult,
  paperReason,
  words,
}: {
  datasetValue: string
  applicationValue: string
  applicationResult: string
  applicationReason?: string | null
  paperValue: string
  paperResult: string
  paperReason?: string | null
  words: AssistantWords
}) {
  const withReason = (result: string, reason?: string | null) =>
    reason?.trim() ? `${result} ${reason.trim()}` : result
  return (
    <Stack gap="tight">
      <p>
        <strong>{words.datasetMethod}</strong>
        ：
        {datasetValue}
      </p>
      <div>
        <p>
          <strong>{words.applicationMethod}</strong>
          ：
          {applicationValue}
        </p>
        <p>
          <strong>{words.judgment}</strong>
          ：
          {withReason(applicationResult, applicationReason)}
        </p>
      </div>
      <div>
        <p>
          <strong>{words.papersMethod}</strong>
          ：
          {paperValue}
        </p>
        <p>
          <strong>{words.judgment}</strong>
          ：
          {withReason(paperResult, paperReason)}
        </p>
      </div>
    </Stack>
  )
}

function joinedOrMissing(
  values: string[] | null | undefined,
  words: AssistantWords,
): string {
  const value = values?.filter((item) => item.trim() !== "").join(", ")
  return value === undefined || value === "" ? words.missing : value
}
