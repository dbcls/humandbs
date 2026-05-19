/**
 * J-DS application -> Research template payload
 *
 * Maps a DsApplicationTransformed (snake_case-resolved J-DS DB record) to a
 * payload that is structurally compatible with CreateResearchRequestSchema.
 * The output is what GET /templates/research/{jdsId} returns; admins paste it
 * into POST /research/new.
 *
 * Field handling notes:
 *   - jds.restriction and jds.icd10 have no slot in the Research schema; admin
 *     adds them at the Dataset layer if needed (no warning emitted).
 *   - collaborators / head are intentionally not folded into dataProvider —
 *     observed J-DS rows mostly have empty collaborators[] and `head` is the
 *     organization head (signing officer), not a data provider in the
 *     humandbs sense.
 *   - submitter is included as an additional dataProvider when it is a
 *     different person from the PI (de-duped by accountId, falling back to
 *     en/ja full name when accountId is missing).
 *   - organization.name interleaves institution and division so the admin
 *     sees the sub-unit in one glance ("University X / Department of Y").
 *   - relatedPublication wraps jds.publication (free-text) into one entry and
 *     also folds in pubmed IDs reached from JGAS via DDBJ Search /dblink, so
 *     boilerplate jds.publication values like "投稿中" are backed up by a
 *     verifiable reference when available.
 */
import {
  DblinkAccessionType,
  fetchDblinkTargets,
} from "@/api/external/ddbj-search/dblink"
import type { DsApplicationTransformed } from "@/api/types"
import type { ResearchTemplateData } from "@/api/types/templates"
import type {
  BilingualText as JgaBilingualText,
  Pi,
  Submitter,
} from "@/crawler/types/jga-shinsei"

const isJgadAccession = (id: string): boolean => /^JGAD\d+$/.test(id)
const isJgasAccession = (id: string): boolean => /^JGAS\d+$/.test(id)

const orNull = (s: string | null | undefined): string | null =>
  s?.trim() ? s : null

const toTextValue = (s: string | null | undefined) =>
  orNull(s) ? { text: orNull(s)! } : null

const toBilingualTextValueRequest = (b: JgaBilingualText) => ({
  ja: toTextValue(b.ja),
  en: toTextValue(b.en),
})

// PI / submitter share a common Pi-shaped structure; we narrow to just the
// fields the Person mapper needs so either can be passed in.
type AgentLike = Pick<
  Pi & Submitter,
  | "accountId"
  | "firstName"
  | "lastName"
  | "institution"
  | "division"
  | "email"
  | "address"
>

// Full name in display order:
//   ja: "{last} {first}"
//   en: "{first} {last}"
const formatAgentName = (
  a: AgentLike,
): { ja: string | null; en: string | null } => {
  const jaParts = [a.lastName.ja, a.firstName.ja].filter(
    (p): p is string => !!orNull(p),
  )
  const enParts = [a.firstName.en, a.lastName.en].filter(
    (p): p is string => !!orNull(p),
  )
  return {
    ja: jaParts.length ? jaParts.join(" ") : null,
    en: enParts.length ? enParts.join(" ") : null,
  }
}

// "{institution} / {division}" when both present, otherwise whichever side
// has a value. Same rule for ja and en, computed independently.
const joinInstitutionAndDivision = (
  institution: JgaBilingualText,
  division: JgaBilingualText,
): JgaBilingualText => {
  const join = (
    inst: string | null | undefined,
    div: string | null | undefined,
  ): string | null => {
    const i = orNull(inst)
    const d = orNull(div)
    if (i && d) return `${i} / ${d}`
    return i ?? d ?? null
  }
  return {
    ja: join(institution.ja, division.ja),
    en: join(institution.en, division.en),
  }
}

const mapAgentToPerson = (a: AgentLike) => {
  const name = formatAgentName(a)
  const orgName = joinInstitutionAndDivision(a.institution, a.division)
  const hasOrg = !!orNull(orgName.ja) || !!orNull(orgName.en)
  return {
    name: {
      ja: name.ja ? { text: name.ja } : null,
      en: name.en ? { text: name.en } : null,
    },
    email: orNull(a.email),
    orcid: null,
    organization: hasOrg
      ? {
        name: toBilingualTextValueRequest(orgName),
        address: a.address.country
          ? { country: orNull(a.address.country) }
          : null,
      }
      : null,
  }
}

/**
 * Decide whether the submitter should be folded in as an extra dataProvider.
 * Primary signal: accountId mismatch. Fallback: en or ja full name mismatch.
 * Conservative: when both sides lack any identifier we skip (avoids duplicating
 * the PI as a phantom second provider).
 */
const submitterIsDistinctFromPi = (
  pi: AgentLike,
  submitter: AgentLike,
): boolean => {
  const piAcct = orNull(pi.accountId)
  const subAcct = orNull(submitter.accountId)
  if (piAcct && subAcct) return piAcct !== subAcct
  const piName = formatAgentName(pi)
  const subName = formatAgentName(submitter)
  // Both names empty -> can't tell, default to "not distinct" so we don't
  // emit a blank person entry.
  if (!piName.en && !piName.ja && !subName.en && !subName.ja) return false
  return piName.en !== subName.en || piName.ja !== subName.ja
}

/**
 * Build extra relatedPublication entries from JGAS -> pubmed dblinks.
 * Returns the pubmed IDs (de-duplicated across all JGAS) and any warnings
 * raised when individual JGAS dblink fetches fail.
 */
const collectPubmedIdsFromJgas = async (
  jgasIds: string[],
  requestId?: string,
): Promise<{ pubmedIds: string[]; warnings: string[] }> => {
  const warnings: string[] = []
  const acc = new Set<string>()
  for (const jgas of jgasIds) {
    try {
      const ids = await fetchDblinkTargets(
        DblinkAccessionType.JGA_STUDY,
        jgas,
        DblinkAccessionType.PUBMED,
        requestId,
      )
      for (const id of ids) acc.add(id)
    } catch (err) {
      warnings.push(
        `${jgas}: dblink to pubmed failed (${err instanceof Error ? err.message : String(err)})`,
      )
    }
  }
  return { pubmedIds: Array.from(acc), warnings }
}

export const mapDsApplicationToResearchTemplate = async (
  jds: DsApplicationTransformed,
  requestId?: string,
): Promise<ResearchTemplateData> => {
  const humIdCandidate = jds.humIds[0]

  const dataProvider = [mapAgentToPerson(jds.pi)]
  if (submitterIsDistinctFromPi(jds.pi, jds.submitter)) {
    dataProvider.push(mapAgentToPerson(jds.submitter))
  }

  const relatedPublication: { title: { ja: string | null; en: string | null } }[] = []
  const pubText = orNull(jds.publication)
  if (pubText) {
    relatedPublication.push({ title: { ja: null, en: pubText } })
  }

  const jgasIds = jds.jgaIds.filter(isJgasAccession)
  const { pubmedIds, warnings: pubmedWarnings } = await collectPubmedIdsFromJgas(
    jgasIds,
    requestId,
  )
  for (const id of pubmedIds) {
    relatedPublication.push({ title: { ja: null, en: `PubMed: ${id}` } })
  }

  return {
    humId: humIdCandidate,
    title: {
      ja: orNull(jds.studyTitle.ja),
      en: orNull(jds.studyTitle.en),
    },
    summary: {
      aims: toBilingualTextValueRequest(jds.aim),
      methods: toBilingualTextValueRequest(jds.method),
      targets: toBilingualTextValueRequest(jds.participant),
      url: { ja: [], en: [] },
    },
    dataProvider,
    researchProject: [],
    grant: [],
    relatedPublication,
    uids: [],
    initialReleaseNote: undefined,
    relatedAccessions: {
      jgad: jds.jgaIds.filter(isJgadAccession),
    },
    warnings: pubmedWarnings,
  }
}
