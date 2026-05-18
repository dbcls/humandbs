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
 *   - collaborators are intentionally not folded into dataProvider — only the
 *     PI seeds the draft so duplicates are not created during review. Admins
 *     can add collaborators by editing the draft.
 *   - relatedPublication wraps jds.publication (free-text) into a single
 *     Publication object with English title.
 */
import type { DsApplicationTransformed } from "@/api/types"
import type { ResearchTemplateData } from "@/api/types/templates"
import type {
  BilingualText as JgaBilingualText,
  Pi,
} from "@/crawler/types/jga-shinsei"

const isJgadAccession = (id: string): boolean => /^JGAD\d+$/.test(id)

const orNull = (s: string | null | undefined): string | null =>
  s?.trim() ? s : null

const toTextValue = (s: string | null | undefined) =>
  orNull(s) ? { text: orNull(s)! } : null

const toBilingualTextValueRequest = (b: JgaBilingualText) => ({
  ja: toTextValue(b.ja),
  en: toTextValue(b.en),
})

// PI's full name in display order:
//   ja: "{last} {first}"
//   en: "{first} {last}"
const formatPiName = (pi: Pi): { ja: string | null; en: string | null } => {
  const jaParts = [pi.lastName.ja, pi.firstName.ja].filter(
    (p): p is string => !!orNull(p),
  )
  const enParts = [pi.firstName.en, pi.lastName.en].filter(
    (p): p is string => !!orNull(p),
  )
  return {
    ja: jaParts.length ? jaParts.join(" ") : null,
    en: enParts.length ? enParts.join(" ") : null,
  }
}

const mapPiToPerson = (pi: Pi) => {
  const name = formatPiName(pi)
  const hasOrg = !!orNull(pi.institution.ja) || !!orNull(pi.institution.en)
  return {
    name: {
      ja: name.ja ? { text: name.ja } : null,
      en: name.en ? { text: name.en } : null,
    },
    email: orNull(pi.email),
    orcid: null,
    organization: hasOrg
      ? {
        name: toBilingualTextValueRequest(pi.institution),
        address: pi.address.country
          ? { country: orNull(pi.address.country) }
          : null,
      }
      : null,
  }
}

export const mapDsApplicationToResearchTemplate = (
  jds: DsApplicationTransformed,
): ResearchTemplateData => {
  const humIdCandidate = jds.humIds[0]
  const relatedPublication = orNull(jds.publication)
    ? [{ title: { ja: null, en: orNull(jds.publication) } }]
    : []

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
    dataProvider: [mapPiToPerson(jds.pi)],
    researchProject: [],
    grant: [],
    relatedPublication,
    uids: [],
    initialReleaseNote: undefined,
    relatedAccessions: {
      jgad: jds.jgaIds.filter(isJgadAccession),
    },
    warnings: [],
  }
}
