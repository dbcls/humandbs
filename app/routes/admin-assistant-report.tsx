import { Fold, Stack } from "~/components/base"
import { KeyValue, Pairs, Section } from "~/components/page"

import { Abstract } from "./admin-assistant-abstract"
import { Datasets } from "./admin-assistant-datasets"
import {
  Checklist,
  ConsistencyReport,
  Papers,
  PlanNotes,
} from "./admin-assistant-document-report"
import type { AssessmentData, AssistantWords } from "./admin-assistant-model"
import { PersonPanel, PersonReport } from "./admin-assistant-person-report"
import {
  display,
  hasEthicsDocument,
  joinFields,
  planAffiliationMatches,
  range,
  ValidationChecklist,
} from "./admin-assistant-report-primitives"

export function AssistantReport({
  report,
  words,
  applicationType,
  busy,
  onAddDatasets,
  onRemoveDataset,
}: {
  report: AssessmentData
  words: AssistantWords
  applicationType: string | undefined
  busy: boolean
  onAddDatasets: (ids: string[]) => Promise<boolean>
  onRemoveDataset: (datasetId: string) => void
}) {
  const sameEmail
    = report.researcher_info?.email !== undefined
      && report.researcher_info.email !== ""
      && report.researcher_info.email === report.submitter_info?.email
  return (
    <Fold summary={words.assessment} open>
      <Stack>
        {report.application_id !== undefined
          && report.application_id !== null && (
          <Section title={words.applicationId}>
            <p className="font-mono text-sm">{report.application_id}</p>
          </Section>
        )}
        {report.title !== undefined && (
          <Section title={words.researchTitle}>
            <p className="text-sm">{report.title}</p>
          </Section>
        )}
        {report.period_of_data_use_end !== undefined
          && report.period_of_data_use_end !== null && (
          <Section title={words.dataUseEnd}>
            <p className="text-sm">{report.period_of_data_use_end}</p>
          </Section>
        )}
        <Stack gap="block">
          <PersonReport
            title={words.researcher}
            validation={{
              person: report.researcher_info,
              verification: report.researcher_verification_result,
            }}
            words={words}
          />
          {sameEmail
            ? (
                <Section title={words.submitter}>
                  <PersonPanel label={words.submitter}>
                    <p className="text-sm">{words.sameAsResearcher}</p>
                  </PersonPanel>
                </Section>
              )
            : (
                <PersonReport
                  title={words.submitter}
                  validation={{
                    person: report.submitter_info,
                    verification: report.submitter_verification_result,
                  }}
                  words={words}
                />
              )}
          <PersonReport
            title={words.institutionHead}
            validation={{
              person: report.head_of_institution_info,
              verification: report.head_of_institution_verification_result,
            }}
            positionVerification={
              report.ethics_document_validation_result
                ?.institution_head_position_verification_result
            }
            isInstitutionHead
            words={words}
          />
        </Stack>
        <ConsistencyReport
          title={words.phoneConsistency}
          result={report.phone_consistency_result}
          people={[
            [words.researcher, report.researcher_info?.phone],
            [words.submitter, report.submitter_info?.phone],
            [words.institutionHead, report.head_of_institution_info?.phone],
          ]}
          words={words}
        />
        <ConsistencyReport
          title={words.emailConsistency}
          result={report.email_domain_consistency_result}
          people={[
            [words.researcher, report.researcher_info?.email],
            [words.submitter, report.submitter_info?.email],
            [words.institutionHead, report.head_of_institution_info?.email],
          ]}
          words={words}
        />
        {applicationType?.includes("提供") === true && (
          <Checklist
            title={words.submissionChecks}
            items={report.submission_application_check_result?.items}
            words={words}
          />
        )}
        {report.ethics_document_info !== undefined
          && report.ethics_document_info !== null
          && hasEthicsDocument(report.ethics_document_info) && (
          <Section title={words.ethicsDocument}>
            <Pairs>
              <KeyValue title={words.researchTitle}>
                {joinFields(
                  report.ethics_document_info.research_project_title_jp,
                  report.ethics_document_info.research_project_title_en,
                  words,
                )}
              </KeyValue>
              <KeyValue title={words.organization}>
                {display(report.ethics_document_info.institution_name, words)}
              </KeyValue>
              <KeyValue title={words.position}>
                {display(
                  report.ethics_document_info.institution_head_position,
                  words,
                )}
              </KeyValue>
              <KeyValue title={words.dataUseEnd}>
                {range(
                  report.ethics_document_info.approval_period_start,
                  report.ethics_document_info.approval_period_end,
                  words,
                )}
              </KeyValue>
            </Pairs>
            <ValidationChecklist
              title={words.ethicsChecks}
              checks={[
                {
                  description: words.ethicsTitleMatches,
                  result:
                      report.ethics_document_validation_result
                        ?.research_title_matches,
                  message:
                      report.ethics_document_validation_result
                        ?.research_title_message,
                },
                {
                  description: words.headPositionVerification,
                  result:
                      report.ethics_document_validation_result
                        ?.institution_head_position_verification_result
                        ?.position_verified,
                  message:
                      report.ethics_document_validation_result
                        ?.institution_head_position_verification_result
                        ?.position_message,
                  evidence:
                      report.ethics_document_validation_result
                        ?.institution_head_position_verification_result
                        ?.position_evidence_url,
                },
              ]}
              words={words}
            />
          </Section>
        )}
        {report.research_plan_validation_result !== undefined
          && report.research_plan_validation_result !== null && (
          <Section title={words.researchPlan}>
            <ValidationChecklist
              title={words.researchPlanChecks}
              checks={[
                {
                  description: words.researcherNameInPlan,
                  result:
                      report.research_plan_validation_result
                        .researcher_name_is_included,
                  message:
                      report.research_plan_validation_result
                        .researcher_name_message,
                },
                {
                  description: words.researcherAffiliationInPlan,
                  result: planAffiliationMatches(
                    report.research_plan_validation_result
                      .researcher_affiliation_matches,
                  ),
                  message:
                      report.research_plan_validation_result
                        .researcher_affiliation_message,
                },
                {
                  description: words.researchTitleInPlan,
                  result:
                      report.research_plan_validation_result
                        .research_title_matches,
                  message:
                      report.research_plan_validation_result
                        .research_title_message,
                },
              ]}
              words={words}
            />
            <PlanNotes
              result={report.research_plan_validation_result}
              words={words}
            />
          </Section>
        )}
        <Abstract report={report} words={words} />
        <Papers papers={report.papers} words={words} />
        <Datasets
          datasets={report.dataset_analysis_list}
          requestedDatasets={report.dataset_info_list}
          policies={report.dataset_policy_groups}
          applicationMethod={report.application_analysis_method}
          paperMethods={report.paper_analysis_method_list}
          abstractIcd10={report.abstract_icd10_list}
          paperIcd10={report.papers?.flatMap((paper) => paper.icd10_code_list ?? [])}
          canManage={applicationType !== "提供申請"}
          busy={busy}
          onAddDatasets={onAddDatasets}
          onRemoveDataset={onRemoveDataset}
          words={words}
        />
      </Stack>
    </Fold>
  )
}
