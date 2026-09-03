/**
 * Reading the JGA application system.
 *
 * **The portal is a reader of this database and nothing else.** It belongs to
 * another project, so the connection forces `default_transaction_read_only`
 * rather than trusting every query here to stay a `SELECT`, and the schema name
 * is configured because it differs between that system's deployments
 * (docs/development.md の「上流のキャッシュを更新する」).
 *
 * The queries answer three of the four cached sources, and the reads that seed a
 * draft from an approved application (docs/editing.md の「上流からの下書き」).
 * The cached three are written as one statement each because the joins that
 * resolve a hum label are expensive enough — a full pass over the accession
 * history and the current entries' 24 million relations — that pulling the
 * pieces into the application and joining them there would mean paying for that
 * pass more than once.
 *
 * **Only what a public page shows is selected.** The application forms hold
 * addresses, telephone numbers, the head of institution and every collaborator;
 * none of it is read here (docs/data-model.md の「外部キャッシュ」).
 *
 * The reads that seed a draft answer a screen rather than a nightly batch, so
 * they are shaped around what this database is fast at. Three things decide it:
 *
 * - **`relation` has no index.** Anything joining it is a pass over 24 million
 *   rows, so a draft's accessions are found through `accession.alias`, which
 *   carries the number of the registration that created the object and does
 *   have one
 * - **`accession` is only reached by prefix.** `LIKE 'JGAD%'` becomes a range
 *   the index answers; the equivalent regular expression does not, and turns a
 *   listing into twenty seconds
 * - **the application form is an EAV table with no index but its key.** Naming
 *   the keys wanted in the `WHERE` clause is what keeps the pivot to a tenth of
 *   a second rather than five seconds
 */

import { Pool } from "pg"

import type { ApplicationDbConfig } from "~/config.server"

/**
 * Long enough for the two passes the hum resolution needs (about half a minute
 * against production), short enough that a refresh cannot sit on somebody
 * else's database indefinitely.
 */
const STATEMENT_TIMEOUT_MS = 300_000

/** `public/live`, the only status DDBJ Search publishes an accession at. */
const LIVE = 2098186

export interface CauUpstreamRow {
  humLabel: string
  applicationId: string
  piNameJa: string
  piNameEn: string
  affiliationJa: string
  affiliationEn: string
  country: string
  researchTitleJa: string
  researchTitleEn: string
  periodStart: string | null
  periodEnd: string | null
  datasetAccessions: string[]
}

export interface HumAccessionUpstreamRow {
  accession: string
  humLabel: string
  kind: "jga-study" | "jga-dataset"
  /** The study a dataset sits under, when upstream draws one and it is public. */
  study: string | null
}

export interface AccessionDateUpstreamRow {
  accession: string
  datePublished: string | null
  dateModified: string | null
}

export function openApplicationDb(config: ApplicationDbConfig): Pool {
  return new Pool({
    connectionString: config.url,
    application_name: "humandbs-upstream-refresh",
    options: `-c default_transaction_read_only=on -c statement_timeout=${STATEMENT_TIMEOUT_MS}`,
    // One query at a time; the refresh runs the three sources in sequence.
    max: 1,
  })
}

/**
 * The pieces every hum resolution needs.
 *
 * A JGA accession's alias carries the number of the submission that created it,
 * and that number is the submission's own id, so the application an accession
 * belongs to is one parse and two joins away. The fallback exists because the
 * submission that created a dataset is not always the one that created its
 * study — adding datasets to an existing study is an ordinary update — and in
 * that case the dataset is resolved through the study it points at.
 *
 * **The relations are read at the current entry only.** They are rewritten per
 * entry, so looking at every entry picks up studies a past version pointed at
 * and turns a dataset's single study into several.
 */
function humResolutionCte(schema: string): string {
  return `
    acc AS (
      SELECT accession_id, accession, alias, substring(accession FROM '^JGA[A-Z]?') AS p
      FROM ${schema}.accession
      WHERE accession ~ '^JGA[A-Z]?[0-9]'
    ),
    sub_hum AS (
      SELECT sp.submission_id, min(a.hum_id) AS hum_label
      FROM ${schema}.submission_permission sp
      JOIN ${schema}.nbdc_application a ON a.appl_id = sp.appl_id
      WHERE a.hum_id ~ '^hum[0-9]+$'
      GROUP BY sp.submission_id
    ),
    alias_hum AS (
      SELECT a.accession_id, a.accession, a.p, sh.hum_label
      FROM acc a
      JOIN sub_hum sh ON sh.submission_id = (regexp_match(a.alias, '^JSUB0*([0-9]+)'))[1]::bigint
    ),
    rel AS (
      SELECT r.self, r.parent
      FROM ${schema}.relation r
      JOIN ${schema}.current_entry ce ON ce.entry_id = r.entry_id
    ),
    x2s AS (
      SELECT DISTINCT r.self AS node, pa.accession AS jgas FROM rel r
      JOIN acc sa ON sa.accession_id = r.self AND sa.p = 'JGAX'
      JOIN acc pa ON pa.accession_id = r.parent AND pa.p = 'JGAS'
    ),
    z2s AS (
      SELECT DISTINCT r.self AS node, pa.accession AS jgas FROM rel r
      JOIN acc sa ON sa.accession_id = r.self AND sa.p = 'JGAZ'
      JOIN acc pa ON pa.accession_id = r.parent AND pa.p = 'JGAS'
    ),
    r2s AS (
      SELECT DISTINCT r.self AS node, x2s.jgas FROM rel r
      JOIN acc sa ON sa.accession_id = r.self AND sa.p = 'JGAR'
      JOIN x2s ON x2s.node = r.parent
    ),
    jgad_jgas AS (
      SELECT DISTINCT sa.accession AS jgad, coalesce(r2s.jgas, z2s.jgas) AS jgas
      FROM rel r
      JOIN acc sa ON sa.accession_id = r.self AND sa.p = 'JGAD'
      LEFT JOIN r2s ON r2s.node = r.parent
      LEFT JOIN z2s ON z2s.node = r.parent
      WHERE coalesce(r2s.jgas, z2s.jgas) IS NOT NULL
    ),
    accession_hum AS (
      SELECT DISTINCT ON (a.accession)
             a.accession, a.p, coalesce(ah.hum_label, jh.hum_label) AS hum_label
      FROM acc a
      LEFT JOIN alias_hum ah ON ah.accession_id = a.accession_id
      LEFT JOIN jgad_jgas jj ON jj.jgad = a.accession
      LEFT JOIN alias_hum jh ON jh.accession = jj.jgas AND jh.p = 'JGAS'
      WHERE a.p IN ('JGAS', 'JGAD') AND coalesce(ah.hum_label, jh.hum_label) IS NOT NULL
      ORDER BY a.accession, coalesce(ah.hum_label, jh.hum_label)
    ),
    live AS (
      SELECT h.accession_id
      FROM ${schema}.accession_history h
      JOIN acc t ON t.accession_id = h.accession_id AND t.p IN ('JGAS', 'JGAD')
      GROUP BY h.accession_id
      HAVING (array_agg(h.accession_status ORDER BY h.status_date DESC))[1] = ${LIVE}
    )`
}

/**
 * The correspondence upstream is the authority for, restricted to what is
 * public there.
 *
 * Public only, because both readers are about published things: the endpoint
 * that supplies the relation to DDBJ Search may not name an unpublished study,
 * and the publish gate compares a version's pins against what upstream says is
 * out (docs/public-api.md, docs/publishing.md).
 *
 * **The edge to a study is held to the same line.** The relation upstream draws
 * covers everything registered, so a published dataset can point at a study
 * that is not out yet; carrying that across would put an accession on a public
 * page that nobody can open.
 */
export async function fetchHumAccessions(
  pool: Pool,
  schema: string,
): Promise<HumAccessionUpstreamRow[]> {
  const { rows } = await pool.query<{
    accession: string
    hum_label: string
    p: string
    study: string | null
  }>(`
    WITH ${humResolutionCte(schema)}
    SELECT ah.accession, ah.hum_label, ah.p,
           CASE WHEN sl.accession_id IS NOT NULL THEN jj.jgas END AS study
    FROM accession_hum ah
    JOIN acc a ON a.accession = ah.accession
    JOIN live l ON l.accession_id = a.accession_id
    LEFT JOIN jgad_jgas jj ON jj.jgad = ah.accession
    LEFT JOIN acc sa ON sa.accession = jj.jgas
    LEFT JOIN live sl ON sl.accession_id = sa.accession_id
    ORDER BY ah.accession`)
  return rows.map((row) => ({
    accession: row.accession,
    humLabel: row.hum_label,
    kind: row.p === "JGAS" ? "jga-study" : "jga-dataset",
    study: row.study,
  }))
}

/**
 * When each public dataset became visible and when it last changed.
 *
 * The publication history is the only date this system keeps, and `live` is
 * recorded again every time the content is updated — so the first is the
 * publication date and the last is the date the description now on show became
 * the one on show. The history only reaches back to 2020-09, which puts every
 * accession published before that on the day it was recorded in bulk; that
 * value is passed on as it is, because deciding where the bulk record ends
 * would be the portal guessing (docs/data-model.md の「外部キャッシュ」).
 *
 * Every public dataset is taken, not only the ones the portal has pinned: this
 * is a cache of upstream's table, and a date already held is one less thing
 * missing the moment an accession is pinned.
 */
export async function fetchJgadDates(
  pool: Pool,
  schema: string,
): Promise<AccessionDateUpstreamRow[]> {
  const { rows } = await pool.query<{
    accession: string
    date_published: string | null
    date_modified: string | null
  }>(`
    WITH target AS (
      SELECT accession_id, accession FROM ${schema}.accession WHERE accession ~ '^JGAD[0-9]'
    ), history AS (
      SELECT h.accession_id,
             (array_agg(h.accession_status ORDER BY h.status_date DESC))[1] AS current_status,
             min(h.status_date) FILTER (WHERE h.accession_status = ${LIVE}) AS first_live,
             max(h.status_date) FILTER (WHERE h.accession_status = ${LIVE}) AS last_live
      FROM ${schema}.accession_history h
      JOIN target t ON t.accession_id = h.accession_id
      GROUP BY h.accession_id
    )
    SELECT t.accession,
           (h.first_live AT TIME ZONE 'Asia/Tokyo')::date::text AS date_published,
           (h.last_live AT TIME ZONE 'Asia/Tokyo')::date::text AS date_modified
    FROM target t
    JOIN history h ON h.accession_id = t.accession_id
    WHERE h.current_status = ${LIVE} AND h.first_live IS NOT NULL
    ORDER BY t.accession`)
  return rows.map((row) => ({
    accession: row.accession,
    datePublished: row.date_published,
    dateModified: row.date_modified,
  }))
}

/**
 * Who has used the controlled-access data of each research.
 *
 * **One row per usage project and hum**, so a project that covers several
 * researches appears on each of their pages carrying only the accessions that
 * belong to that one.
 *
 * Which branch of an application to read is the whole difficulty. A project's
 * branches are not a history but different kinds of paperwork sharing one
 * numbering, so the newest is the wrong answer twice over: the newest branch of
 * all is sometimes not approved, and the newest approved one is usually a usage
 * report, whose named investigator is whoever holds the post now rather than
 * whoever the use was granted to. The values that define what a use *is* are
 * therefore read from the approved initial application, while the two things
 * later branches genuinely change — the period and the datasets — are read from
 * where the system keeps them summed per project.
 *
 * The end of the period follows the same care. Reaching the expiry is not the
 * same as ending: a project can expire and be extended back into use, so the
 * expiry date answers except where a closing report was approved, whose date is
 * the real end and is sometimes earlier than the expiry that was on record.
 */
export async function fetchCauEntries(
  pool: Pool,
  schema: string,
): Promise<CauUpstreamRow[]> {
  const { rows } = await pool.query<{
    ds_du_id: string
    hum_label: string
    pi_last_ja: string | null
    pi_first_ja: string | null
    pi_last_en: string | null
    pi_first_en: string | null
    division_ja: string | null
    institution_ja: string | null
    division_en: string | null
    institution_en: string | null
    country: string | null
    title_ja: string | null
    title_en: string | null
    started_on: string | null
    ended_on: string | null
    accessions: string[]
  }>(`
    WITH ${humResolutionCte(schema)},
    scope AS (
      SELECT p.ds_du_id, p.phase_type, p.history_date
      FROM ${schema}.current_nbdc_phase p
      JOIN ${schema}.nbdc_application_master m ON m.ds_du_id = p.ds_du_id
      WHERE m.data_type = 2 AND p.phase_type IN (160, 190, 200, 210, 220)
    ),
    initial_branch AS (
      SELECT DISTINCT ON (a.ds_du_id) a.ds_du_id, a.appl_id
      FROM ${schema}.nbdc_application a
      JOIN scope sc ON sc.ds_du_id = a.ds_du_id
      JOIN ${schema}.current_nbdc_application_status st ON st.appl_id = a.appl_id
      WHERE a.application_type = 10 AND st.appl_status_type = 60
      ORDER BY a.ds_du_id, a.appl_version DESC
    ),
    latest_submit AS (
      SELECT DISTINCT ON (b.appl_id) b.ds_du_id, s.appl_submit_id
      FROM initial_branch b
      JOIN ${schema}.nbdc_application_submit s ON s.appl_id = b.appl_id
      ORDER BY b.appl_id, s.submit_date DESC NULLS LAST, s.appl_submit_id DESC
    ),
    stated AS (
      SELECT ls.ds_du_id,
        max(c.value) FILTER (WHERE c.key = 'pi_last_name')       AS pi_last_ja,
        max(c.value) FILTER (WHERE c.key = 'pi_first_name')      AS pi_first_ja,
        max(c.value) FILTER (WHERE c.key = 'pi_last_name_en')    AS pi_last_en,
        max(c.value) FILTER (WHERE c.key = 'pi_first_name_en')   AS pi_first_en,
        max(c.value) FILTER (WHERE c.key = 'pi_division')        AS division_ja,
        max(c.value) FILTER (WHERE c.key = 'pi_institution')     AS institution_ja,
        max(c.value) FILTER (WHERE c.key = 'pi_division_en')     AS division_en,
        max(c.value) FILTER (WHERE c.key = 'pi_institution_en')  AS institution_en,
        max(c.value) FILTER (WHERE c.key = 'pi_country_en')      AS country,
        max(c.value) FILTER (WHERE c.key = 'use_study_title')    AS title_ja,
        max(c.value) FILTER (WHERE c.key = 'use_study_title_en') AS title_en
      FROM latest_submit ls
      JOIN ${schema}.nbdc_application_component c ON c.appl_submit_id = ls.appl_submit_id
      WHERE c.t_order = -1
      GROUP BY ls.ds_du_id
    ),
    started AS (
      SELECT ds_du_id, min(history_date) AS started_at
      FROM ${schema}.nbdc_phase_history WHERE phase_type = 160 GROUP BY ds_du_id
    ),
    granted AS (
      SELECT DISTINCT sc.ds_du_id, ac.accession
      FROM scope sc
      JOIN ${schema}.nbdc_application a ON a.ds_du_id = sc.ds_du_id
      JOIN ${schema}.current_nbdc_application_status st
        ON st.appl_id = a.appl_id AND st.appl_status_type = 60
      JOIN ${schema}.use_permission up ON up.appl_id = a.appl_id
      JOIN ${schema}.accession ac ON ac.accession_id = up.dataset_id
    )
    SELECT sc.ds_du_id, ah.hum_label,
           v.pi_last_ja, v.pi_first_ja, v.pi_last_en, v.pi_first_en,
           v.division_ja, v.institution_ja, v.division_en, v.institution_en,
           v.country, v.title_ja, v.title_en,
           (st.started_at AT TIME ZONE 'Asia/Tokyo')::date::text AS started_on,
           CASE WHEN sc.phase_type IN (190, 200)
                THEN (sc.history_date AT TIME ZONE 'Asia/Tokyo')::date::text
                ELSE period.expire_date::text END AS ended_on,
           array_agg(DISTINCT g.accession ORDER BY g.accession) AS accessions
    FROM scope sc
    JOIN granted g ON g.ds_du_id = sc.ds_du_id
    JOIN accession_hum ah ON ah.accession = g.accession
    JOIN stated v ON v.ds_du_id = sc.ds_du_id
    LEFT JOIN started st ON st.ds_du_id = sc.ds_du_id
    LEFT JOIN ${schema}.nbdc_use_period period ON period.ds_du_id = sc.ds_du_id
    GROUP BY sc.ds_du_id, ah.hum_label, sc.phase_type, sc.history_date, period.expire_date,
             v.pi_last_ja, v.pi_first_ja, v.pi_last_en, v.pi_first_en,
             v.division_ja, v.institution_ja, v.division_en, v.institution_en,
             v.country, v.title_ja, v.title_en, st.started_at
    ORDER BY ah.hum_label, sc.ds_du_id`)

  return rows.map((row) => ({
    humLabel: row.hum_label,
    applicationId: row.ds_du_id,
    piNameJa: joinName(row.pi_last_ja, row.pi_first_ja),
    piNameEn: joinName(row.pi_first_en, row.pi_last_en),
    affiliationJa: joinAffiliation(row.division_ja, row.institution_ja),
    affiliationEn: joinAffiliation(row.division_en, row.institution_en),
    country: row.country ?? "",
    researchTitleJa: row.title_ja ?? "",
    researchTitleEn: row.title_en ?? "",
    periodStart: row.started_on,
    periodEnd: row.ended_on,
    datasetAccessions: row.accessions,
  }))
}

/**
 * One approved branch of a data-submission application: what the listing shows
 * of it, which is also what a keyword is matched against.
 */
export interface DsBranchRow {
  /** `J-DS000136-010`. Assembled from two columns; the system holds no such column. */
  applicationId: string
  humLabel: string | null
  approvedOn: string | null
  titleJa: string
  titleEn: string
  piNameJa: string
  piNameEn: string
  /** The studies and datasets registered under this branch. */
  accessions: string[]
}

/** The rest of what a draft is seeded from. */
export interface DsBranchDetail extends DsBranchRow {
  aimsJa: string
  aimsEn: string
  methodsJa: string
  methodsEn: string
  targetsJa: string
  targetsEn: string
  affiliationJa: string
  affiliationEn: string
  country: string
  /** 1 unrestricted, 2 controlled type I, 3 both, 4 controlled type II. */
  dataAccess: number | null
  /** As typed: codes separated by commas, ideographic commas or spaces. */
  icd10: string
}

/** A dataset as the registration system holds it, whether or not it is public. */
export interface JgadRegistration {
  accession: string
  title: string
  /** The EGA-controlled assay of the dataset. Absent for 64% of them. */
  datasetType: string
}

/** Status 60. The branches a draft may be seeded from are the approved ones. */
const APPROVED = 60

/**
 * The keys of the application form a draft reads. **Naming them is what makes
 * the pivot cheap**, and it is also the whole of what leaves the upstream
 * system: the connection can reach the addresses and the telephone numbers, and
 * this list is where it is decided that it does not
 * (docs/editing.md の「上流からの下書き」).
 */
const FORM_KEYS = [
  "submission_study_title", "submission_study_title_en",
  "aim", "aim_en",
  "method", "method_en",
  "participant", "participant_en",
  "pi_last_name", "pi_first_name", "pi_last_name_en", "pi_first_name_en",
  "pi_division", "pi_institution", "pi_division_en", "pi_institution_en",
  "pi_country_en",
  "icd10",
] as const

/**
 * The branches, the form values, and what each branch registered.
 *
 * A JGA accession's alias names the registration that created it, and that
 * number is the registration's own id, so the two are joined without reading a
 * single relation.
 */
function branchCte(schema: string): string {
  return `
    jga AS (
      SELECT accession, (regexp_match(alias, '^JSUB0*([0-9]+)'))[1]::bigint AS submission_id
      FROM ${schema}.accession
      WHERE (accession LIKE 'JGAS%' OR accession LIKE 'JGAD%') AND alias LIKE 'JSUB%'
    ),
    branch AS (
      SELECT a.appl_id,
             a.ds_du_id || '-' || lpad(a.appl_version::text, 3, '0') AS application_id,
             nullif(btrim(a.hum_id), '') AS hum_label,
             a.data_access
      FROM ${schema}.nbdc_application a
      JOIN ${schema}.current_nbdc_application_status st ON st.appl_id = a.appl_id
      WHERE st.appl_status_type = ${APPROVED} AND a.ds_du_id LIKE 'J-DS%'
    ),
    submit AS (
      SELECT DISTINCT ON (b.appl_id) b.appl_id, s.appl_submit_id
      FROM branch b
      JOIN ${schema}.nbdc_application_submit s ON s.appl_id = b.appl_id
      ORDER BY b.appl_id, s.submit_date DESC NULLS LAST, s.appl_submit_id DESC
    ),
    stated AS (
      SELECT sm.appl_id,
        ${FORM_KEYS.map((key) => `max(c.value) FILTER (WHERE c.key = '${key}') AS "${key}"`).join(",\n        ")}
      FROM submit sm
      JOIN ${schema}.nbdc_application_component c ON c.appl_submit_id = sm.appl_submit_id
      WHERE c.t_order = -1 AND c.key IN (${FORM_KEYS.map((key) => `'${key}'`).join(", ")})
      GROUP BY sm.appl_id
    ),
    approved AS (
      SELECT appl_id, max(history_date) AS approved_at
      FROM ${schema}.nbdc_application_status_history
      WHERE appl_status_type = ${APPROVED}
      GROUP BY appl_id
    ),
    registered AS (
      SELECT sp.appl_id, array_agg(DISTINCT j.accession ORDER BY j.accession) AS accessions
      FROM ${schema}.submission_permission sp
      JOIN jga j ON j.submission_id = sp.submission_id
      GROUP BY sp.appl_id
    )`
}

/** What every branch query selects, ordered newest approval first. */
const BRANCH_COLUMNS = `
  b.application_id, b.hum_label, b.data_access,
  (ap.approved_at AT TIME ZONE 'Asia/Tokyo')::date::text AS approved_on,
  ${FORM_KEYS.map((key) => `v."${key}"`).join(", ")},
  coalesce(r.accessions, ARRAY[]::text[]) AS accessions`

const BRANCH_FROM = `
  FROM branch b
  JOIN stated v ON v.appl_id = b.appl_id
  LEFT JOIN approved ap ON ap.appl_id = b.appl_id
  LEFT JOIN registered r ON r.appl_id = b.appl_id`

interface BranchQueryRow extends Record<(typeof FORM_KEYS)[number], string | null> {
  application_id: string
  hum_label: string | null
  data_access: number | null
  approved_on: string | null
  accessions: string[]
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? ""
}

function branchRow(row: BranchQueryRow): DsBranchRow {
  return {
    applicationId: row.application_id,
    humLabel: row.hum_label,
    approvedOn: row.approved_on,
    titleJa: text(row.submission_study_title),
    titleEn: text(row.submission_study_title_en),
    piNameJa: joinName(row.pi_last_name, row.pi_first_name),
    piNameEn: joinName(row.pi_first_name_en, row.pi_last_name_en),
    accessions: row.accessions,
  }
}

/**
 * The branches a keyword names, newest approval first.
 *
 * The keyword is matched against the hum label, the application number, the
 * study title and the name of the investigator — everything the row shows, so
 * that what is searched and what is read back are the same four things. An
 * empty keyword answers the newest branches, which is what somebody who has
 * just been told a number is looking at.
 */
export async function searchDsBranches(
  pool: Pool,
  schema: string,
  keyword: string,
  limit: number,
): Promise<DsBranchRow[]> {
  const trimmed = keyword.trim()
  const { rows } = await pool.query<BranchQueryRow>(`
    WITH ${branchCte(schema)}
    SELECT ${BRANCH_COLUMNS}
    ${BRANCH_FROM}
    WHERE $1 = '' OR (
         b.application_id ILIKE '%' || $1 || '%'
      OR coalesce(b.hum_label, '') ILIKE '%' || $1 || '%'
      OR coalesce(v."submission_study_title", '') ILIKE '%' || $1 || '%'
      OR coalesce(v."submission_study_title_en", '') ILIKE '%' || $1 || '%'
      OR coalesce(v."pi_last_name", '') || coalesce(v."pi_first_name", '') ILIKE '%' || $1 || '%'
      OR coalesce(v."pi_first_name_en", '') || ' ' || coalesce(v."pi_last_name_en", '') ILIKE '%' || $1 || '%'
    )
    ORDER BY ap.approved_at DESC NULLS LAST, b.appl_id DESC
    LIMIT $2`, [trimmed, limit])
  return rows.map(branchRow)
}

/** One branch, with everything a draft takes from it. */
export async function fetchDsBranch(
  pool: Pool,
  schema: string,
  applicationId: string,
): Promise<DsBranchDetail | null> {
  const { rows } = await pool.query<BranchQueryRow>(`
    WITH ${branchCte(schema)}
    SELECT ${BRANCH_COLUMNS}
    ${BRANCH_FROM}
    WHERE b.application_id = $1
    LIMIT 1`, [applicationId])

  const row = rows[0]
  if (row === undefined) return null
  return {
    ...branchRow(row),
    aimsJa: text(row.aim),
    aimsEn: text(row.aim_en),
    methodsJa: text(row.method),
    methodsEn: text(row.method_en),
    targetsJa: text(row.participant),
    targetsEn: text(row.participant_en),
    affiliationJa: joinAffiliation(row.pi_division, row.pi_institution),
    affiliationEn: joinAffiliation(row.pi_division_en, row.pi_institution_en),
    country: text(row.pi_country_en),
    dataAccess: row.data_access,
    icd10: text(row.icd10),
  }
}

/**
 * The branch an accession was registered under, so that an accession typed on
 * its own still carries the application's access type and diseases.
 *
 * **Nothing is answered when the registration belongs to more than one approved
 * branch.** Thirty-six registrations are referenced by two applications, and
 * the two can disagree about the access type; guessing between them would put a
 * value in the draft that no application states.
 */
export async function fetchAccessionBranchId(
  pool: Pool,
  schema: string,
  accession: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ application_id: string }>(`
    WITH ${branchCte(schema)}
    SELECT DISTINCT b.application_id
    FROM jga j
    JOIN ${schema}.submission_permission sp ON sp.submission_id = j.submission_id
    JOIN branch b ON b.appl_id = sp.appl_id
    WHERE j.accession = $1
    LIMIT 2`, [accession])
  return rows.length === 1 ? rows[0]?.application_id ?? null : null
}

/**
 * What the registration system says about datasets, read from the submitted XML
 * rather than from DDBJ Search.
 *
 * **The XML is the only source that answers before publication**, and a draft is
 * written for something that has not been published yet. The extraction is left
 * to the database so that the portal holds no XML parser for two elements.
 */
export async function fetchJgadRegistrations(
  pool: Pool,
  schema: string,
  accessions: readonly string[],
): Promise<JgadRegistration[]> {
  if (accessions.length === 0) return []
  const { rows } = await pool.query<{
    accession: string
    title: string | null
    dataset_type: string | null
  }>(`
    WITH latest AS (
      SELECT DISTINCT ON (a.accession) a.accession, m.metadata
      FROM ${schema}.accession a
      JOIN ${schema}.metadata m ON m.accession_id = a.accession_id
      WHERE a.accession = ANY($1)
      ORDER BY a.accession, m.metadata_version DESC
    )
    SELECT accession,
           (xpath('/DATASET/TITLE/text()', metadata::xml))[1]::text AS title,
           (xpath('/DATASET/DATASET_TYPE/text()', metadata::xml))[1]::text AS dataset_type
    FROM latest
    ORDER BY accession`, [[...accessions]])
  return rows.map((row) => ({
    accession: row.accession,
    title: text(row.title),
    datasetType: text(row.dataset_type),
  }))
}

/** Family name first in Japanese, given name first in English. */
function joinName(first: string | null, second: string | null): string {
  return [first, second].map((part) => part?.trim() ?? "").filter((part) => part !== "").join(" ")
}

/**
 * The division before the institution. The institution alone matches what the
 * old portal published for only 8% of rows; with the division in front it is
 * 65%, which is what says the two belong together.
 */
function joinAffiliation(division: string | null, institution: string | null): string {
  return [division, institution]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(", ")
}
