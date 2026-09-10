import type { ReactNode } from "react"

import { Note, Stack } from "~/components/base"
import { KeyValue, Pairs, Section } from "~/components/page"

import type {
  AddressVerification,
  AssistantWords,
  Person,
  PersonValidation,
  PositionVerification,
  VerificationResult,
} from "./admin-assistant-model"
import {
  display,
  domain,
  ExternalLink,
  joinFields,
  joinText,
  JudgmentText,
  StatusText,
  VerificationRow,
} from "./admin-assistant-report-primitives"

export function PersonReport({
  title,
  validation,
  positionVerification,
  isInstitutionHead = false,
  words,
}: {
  title: string
  validation: PersonValidation
  positionVerification?: PositionVerification | null
  isInstitutionHead?: boolean
  words: AssistantWords
}) {
  const { person, verification } = validation
  if (person === undefined) return null
  const warnings = [
    !isInstitutionHead && !person.name_en ? words.name : null,
    isInstitutionHead && !person.name_jp && !person.name_en ? words.name : null,
    !isInstitutionHead && !person.title_en ? words.position : null,
    isInstitutionHead && !person.title_jp && !person.title_en
      ? words.position
      : null,
    !person.organization_jp && !person.organization_en
      ? words.organization
      : null,
    !person.phone ? words.phone : null,
    !person.email ? words.email : null,
    !isInstitutionHead && !person.address ? words.address : null,
  ].filter((warning): warning is string => warning !== null)
  return (
    <Section title={title}>
      <PersonPanel label={title}>
        <Stack gap="tight">
          <Pairs>
            <KeyValue title={words.name}>
              {joinFields(person.name_jp, person.name_en, words)}
            </KeyValue>
            <KeyValue title={words.position}>
              {joinFields(person.title_jp, person.title_en, words)}
            </KeyValue>
          </Pairs>
          {positionVerification !== undefined
            && positionVerification !== null && (
            <GroupedVerification>
              <VerificationRow
                label={words.headPositionVerification}
                result={positionVerification.position_verified}
                message={positionVerification.position_message}
                evidence={positionVerification.position_evidence_url}
                words={words}
              />
            </GroupedVerification>
          )}
          <Pairs>
            <KeyValue title={words.organization}>
              {joinFields(person.organization_jp, person.organization_en, words)}
            </KeyValue>
          </Pairs>
          {verification !== undefined && (
            <GroupedVerification>
              <OrganizationVerification verification={verification} words={words} />
            </GroupedVerification>
          )}
          <Pairs>
            <KeyValue title={words.email}>
              {display(person.email, words)}
            </KeyValue>
          </Pairs>
          {verification !== undefined && (
            <GroupedVerification>
              <EmailVerification verification={verification} words={words} />
            </GroupedVerification>
          )}
          <Pairs>
            <KeyValue title={words.phone}>
              {display(person.phone, words)}
            </KeyValue>
          </Pairs>
          {verification?.phone_validation_result != null && (
            <GroupedVerification>
              <PhoneVerificationDetails
                verification={verification}
                person={person}
                words={words}
              />
            </GroupedVerification>
          )}
          {!isInstitutionHead && (
            <>
              <Pairs>
                <KeyValue title={words.address}>
                  {display(person.address, words)}
                </KeyValue>
              </Pairs>
              {verification?.address_validation_result != null && (
                <GroupedVerification>
                  <AddressVerificationDetails
                    verification={verification}
                    person={person}
                    words={words}
                  />
                </GroupedVerification>
              )}
            </>
          )}
          {warnings.length > 0 && (
            <Note kind="warning">
              {warnings.join(", ")}
              :
              {words.missing}
            </Note>
          )}
        </Stack>
      </PersonPanel>
    </Section>
  )
}

export function PersonPanel({ label, children }: { label: string, children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="rounded-r border-brand border-l-4 bg-surface px-4 py-3 sm:px-5"
    >
      {children}
    </div>
  )
}

function GroupedVerification({ children }: { children: ReactNode }) {
  return (
    <div className="ml-4 border-line border-l pl-3">
      {children}
    </div>
  )
}

function OrganizationVerification({
  verification,
  words,
}: {
  verification: VerificationResult | undefined
  words: AssistantWords
}) {
  if (verification === undefined) return null
  const hasLegalEntity = [
    verification.organization_legal_entity_type,
    verification.organization_legal_entity_message,
    ...(verification.organization_legal_entity_urls ?? []),
  ].some((value) => typeof value === "string" && value.trim() !== "")
  return (
    <Stack gap="tight">
      {hasLegalEntity && (
        <div className="rounded p-2 text-sm">
          <span className="font-semibold">
            {words.legalEntity}
            :
            {" "}
          </span>
          {display(verification.organization_legal_entity_type, words)}
          {verification.organization_legal_entity_message && (
            <span>
              {" "}
              —
              {verification.organization_legal_entity_message}
            </span>
          )}
          {(verification.organization_legal_entity_urls?.length ?? 0) > 0 && (
            <div>
              <span className="font-semibold">
                {words.referenceUrl}
                :
                {" "}
              </span>
              {(verification.organization_legal_entity_urls ?? []).map((url, index) => (
                <span key={url}>
                  {index > 0 && ", "}
                  <ExternalLink url={url} label={domain(url)} words={words} />
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <VerificationRow
        label={words.profile}
        result={
          verification.researcher_profile_url === undefined
          || verification.researcher_profile_url === null
            ? false
            : true
        }
        message={joinText(
          verification.researcher_profile_message,
          verification.researcher_profile_last_updated,
        )}
        evidence={verification.researcher_profile_url}
        words={words}
      />
      {verification.orcid_url && (
        <div className="text-sm">
          <span className="font-semibold">
            {words.orcid}
            :
            {" "}
          </span>
          <ExternalLink url={verification.orcid_url} words={words} />
        </div>
      )}
    </Stack>
  )
}

function EmailVerification({
  verification,
  words,
}: {
  verification: VerificationResult | undefined
  words: AssistantWords
}) {
  if (verification === undefined) return null
  const emailVerified
    = verification.mx_domain_verified === undefined
      || verification.organization_domain_verified === undefined
      ? undefined
      : verification.mx_domain_verified
        && verification.organization_domain_verified
  return (
    <Stack gap="tight">
      <VerificationRow
        label={words.emailVerification}
        result={emailVerified}
        words={words}
      />
      <VerificationRow
        label={words.mxVerification}
        result={verification.mx_domain_verified}
        message={verification.mx_domain_failure_reason}
        words={words}
      />
      <VerificationRow
        label={words.organizationDomain}
        result={verification.organization_domain_verified}
        message={verification.organization_domain_message}
        evidence={verification.organization_domain_evidence_url}
        words={words}
      />
      <VerificationRow
        label={words.supplementaryEmailVerification}
        result={verification.researcher_email_verified}
        message={joinText(
          verification.researcher_email_message,
          verification.researcher_profile_last_updated,
        )}
        evidence={verification.researcher_email_evidence_url}
        words={words}
      />
    </Stack>
  )
}

function PhoneVerificationDetails({
  verification,
  person,
  words,
}: {
  verification: VerificationResult | undefined
  person: Person
  words: AssistantWords
}) {
  const phone = verification?.phone_validation_result
  if (phone === undefined || phone === null) return null
  return (
    <div className="rounded p-2 text-sm">
      <p className="font-semibold">{words.phoneVerification}</p>
      <Pairs>
        {phone.corrected_phone_number
          && phone.corrected_phone_number !== person.phone && (
          <KeyValue title={words.normalizedPhone}>
            {phone.corrected_phone_number}
          </KeyValue>
        )}
        <KeyValue title={words.countryCode}>
          <StatusText
            result={phone.country_code_matched_with_address}
            words={words}
          />
          {phone.country_code_message && ` — ${phone.country_code_message}`}
        </KeyValue>
        <KeyValue title={words.phoneType}>
          {display(phone.judge_about_cell_phone, words)}
        </KeyValue>
        <KeyValue title={words.phoneRelation}>
          <StatusText
            result={phone.related_to_researcher_or_organization}
            words={words}
          />
          {phone.researcher_phone_message
            && ` — ${joinText(
              phone.researcher_phone_message,
              phone.researcher_phone_last_updated_year,
            )}`}
          {phone.researcher_phone_url && (
            <>
              {" "}
              <ExternalLink
                url={phone.researcher_phone_url}
                words={words}
              />
            </>
          )}
        </KeyValue>
      </Pairs>
    </div>
  )
}

function AddressVerificationDetails({
  verification,
  person,
  words,
}: {
  verification: VerificationResult | undefined
  person: Person
  words: AssistantWords
}) {
  const address = verification?.address_validation_result
  if (address === undefined || address === null) return null
  return (
    <div className="rounded p-2 text-sm">
      <p className="font-semibold">{words.addressVerification}</p>
      <Pairs>
        <KeyValue title={words.formattedAddress}>
          {display(address.formatted_address ?? person.address, words)}
        </KeyValue>
        <KeyValue title={words.result}>
          <StatusText result={address.address_exists} words={words} />
          {address.organization_match && (
            <>
              {" "}
              —
              {" "}
              <JudgmentText value={address.organization_match} />
            </>
          )}
          {address.message && ` — ${address.message}`}
        </KeyValue>
        <KeyValue title={words.maps}>
          <MapLinks links={address.google_map_urls} words={words} />
        </KeyValue>
      </Pairs>
    </div>
  )
}

function MapLinks({
  links,
  words,
}: {
  links: AddressVerification["google_map_urls"]
  words: AssistantWords
}) {
  if (links === undefined || links.length === 0) return <>-</>
  return (
    <>
      {links.map((link, index) => {
        const url = "url" in link ? link.url : link[0]
        const label = "url" in link ? link.label : link[1]
        return (
          <span key={`${url}-${index}`}>
            {index > 0 && ", "}
            <ExternalLink url={url} label={label} words={words} />
          </span>
        )
      })}
    </>
  )
}
