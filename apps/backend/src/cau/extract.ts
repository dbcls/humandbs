import { jgaSql, JGA_DB_SCHEMA } from "@/api/db-client/client"

import type { RawCore, RawDuPhase, RawJgad, RawJgadHumId, RawPerson } from "./types"

const str = (v: unknown): string => {
  if (v == null) return ""
  if (typeof v === "string") return v.trim()
  if (typeof v === "number" || typeof v === "bigint") return String(v).trim()
  return ""
}
const dateStr = (v: unknown): string | null => {
  const s = str(v)
  return s ? s.substring(0, 10) : null
}

const runQuery = async <T>(sql: string, mapFn: (r: Record<string, unknown>) => T): Promise<T[]> => {
  const rows = await jgaSql.begin(async (tx) => {
    await tx.unsafe(`SET search_path TO ${JGA_DB_SCHEMA}, public`)
    await tx.unsafe("SET statement_timeout TO 0")
    return await tx.unsafe(sql)
  })
  return (rows as Record<string, unknown>[]).map(mapFn)
}

export const extractCore = async (): Promise<RawCore[]> =>
  runQuery(`
    WITH du AS (
      SELECT na.appl_id, na.ds_du_id AS jdu_id, na.appl_version, m.account_group
      FROM nbdc_application na
      JOIN nbdc_application_master m ON m.ds_du_id=na.ds_du_id AND m.data_type=2
    ),
    ls AS (
      SELECT DISTINCT ON (ns.appl_id) ns.appl_id, ns.appl_submit_id, ns.submit_date
      FROM nbdc_application_submit ns JOIN du ON du.appl_id=ns.appl_id
      ORDER BY ns.appl_id, ns.submit_date DESC NULLS LAST, ns.appl_submit_id DESC
    ),
    st AS (
      SELECT DISTINCT ON (cas.appl_id) cas.appl_id, cas.appl_status_type AS status
      FROM current_nbdc_application_status cas JOIN du ON du.appl_id=cas.appl_id
      ORDER BY cas.appl_id, cas.history_date DESC NULLS LAST, cas.appl_status_history_id DESC
    ),
    ev AS (
      SELECT ls.appl_id,
        max(c.value) FILTER (WHERE c.key='pi_account_id')     AS pi_account_id,
        max(c.value) FILTER (WHERE c.key='pi_email')          AS pi_email,
        max(c.value) FILTER (WHERE c.key='pi_last_name_en')   AS pi_last_en,
        max(c.value) FILTER (WHERE c.key='pi_first_name_en')  AS pi_first_en,
        max(c.value) FILTER (WHERE c.key='pi_last_name')      AS pi_last_ja,
        max(c.value) FILTER (WHERE c.key='pi_first_name')     AS pi_first_ja,
        max(c.value) FILTER (WHERE c.key='pi_institution_en') AS pi_inst_en
      FROM ls JOIN nbdc_application_component c ON c.appl_submit_id=ls.appl_submit_id
      GROUP BY ls.appl_id
    )
    SELECT du.jdu_id, du.appl_id, du.appl_version, st.status, ls.submit_date, du.account_group,
           ev.pi_account_id, ev.pi_email, ev.pi_last_en, ev.pi_first_en,
           ev.pi_last_ja, ev.pi_first_ja, ev.pi_inst_en
    FROM du
    LEFT JOIN ls ON ls.appl_id=du.appl_id
    LEFT JOIN st ON st.appl_id=du.appl_id
    LEFT JOIN ev ON ev.appl_id=du.appl_id
    ORDER BY du.jdu_id, du.appl_version, du.appl_id
  `, r => ({
    jduId: str(r.jdu_id),
    applId: str(r.appl_id),
    applVersion: str(r.appl_version),
    status: str(r.status),
    submitDate: str(r.submit_date),
    accountGroup: str(r.account_group),
    piAccountId: str(r.pi_account_id),
    piEmail: str(r.pi_email),
    piLastEn: str(r.pi_last_en),
    piFirstEn: str(r.pi_first_en),
    piLastJa: str(r.pi_last_ja),
    piFirstJa: str(r.pi_first_ja),
    piInstEn: str(r.pi_inst_en),
  }))

export const extractPeople = async (): Promise<RawPerson[]> =>
  runQuery(`
    WITH du AS (
      SELECT na.appl_id FROM nbdc_application na
      JOIN nbdc_application_master m ON m.ds_du_id=na.ds_du_id AND m.data_type=2
    ),
    ls AS (
      SELECT DISTINCT ON (ns.appl_id) ns.appl_id, ns.appl_submit_id
      FROM nbdc_application_submit ns JOIN du ON du.appl_id=ns.appl_id
      ORDER BY ns.appl_id, ns.submit_date DESC NULLS LAST, ns.appl_submit_id DESC
    ),
    comp AS (
      SELECT ls.appl_id,
        CASE WHEN c.key LIKE 'collaborator%' THEN 'collaborator' ELSE 'member' END AS role,
        c.key, c.value,
        row_number() OVER (
          PARTITION BY ls.appl_id,
            CASE WHEN c.key LIKE 'collaborator%' THEN 'collaborator' ELSE 'member' END,
            c.key
          ORDER BY c.t_order
        ) AS idx
      FROM ls JOIN nbdc_application_component c ON c.appl_submit_id=ls.appl_submit_id
      WHERE c.key LIKE 'member_%' OR c.key LIKE 'collaborator_%'
    )
    SELECT appl_id, role, idx,
      max(value) FILTER (WHERE key='member_account_id')                          AS account_id,
      max(value) FILTER (WHERE key='member_email')                               AS email,
      max(value) FILTER (WHERE key IN ('member_orcid','collaborator_orcid'))      AS orcid,
      max(value) FILTER (WHERE key IN ('member_eradid','collaborator_eradid'))   AS eradid,
      max(value) FILTER (WHERE key='member_last_name_en')                        AS last_en,
      max(value) FILTER (WHERE key='member_first_name_en')                       AS first_en,
      max(value) FILTER (WHERE key IN ('member_institution_en','collaborator_division')) AS institution,
      max(value) FILTER (WHERE key='collaborator_name')                          AS name_full
    FROM comp
    GROUP BY appl_id, role, idx
    HAVING coalesce(
      max(value) FILTER (WHERE key='member_email'),
      max(value) FILTER (WHERE key='member_last_name_en'),
      max(value) FILTER (WHERE key='collaborator_name'),
      max(value) FILTER (WHERE key IN ('member_orcid','collaborator_orcid')), '') <> ''
    ORDER BY appl_id, role, idx
  `, r => ({
    applId: str(r.appl_id),
    role: str(r.role) as "member" | "collaborator",
    idx: Number(r.idx),
    accountId: str(r.account_id),
    email: str(r.email),
    orcid: str(r.orcid),
    eradid: str(r.eradid),
    lastEn: str(r.last_en),
    firstEn: str(r.first_en),
    institution: str(r.institution),
    nameFull: str(r.name_full),
  }))

export const extractJgad = async (): Promise<RawJgad[]> =>
  runQuery(`
    WITH du AS (
      SELECT na.appl_id FROM nbdc_application na
      JOIN nbdc_application_master m ON m.ds_du_id=na.ds_du_id AND m.data_type=2
    ),
    ls AS (
      SELECT DISTINCT ON (ns.appl_id) ns.appl_id, ns.appl_submit_id
      FROM nbdc_application_submit ns JOIN du ON du.appl_id=ns.appl_id
      ORDER BY ns.appl_id, ns.submit_date DESC NULLS LAST, ns.appl_submit_id DESC
    ),
    up AS (
      SELECT du.appl_id, a.accession AS jgad
      FROM du JOIN use_permission up ON up.appl_id=du.appl_id
      JOIN accession a ON a.accession_id=up.dataset_id
      WHERE a.accession LIKE 'JGAD%'
    ),
    ev AS (
      SELECT ls.appl_id, c.value AS jgad
      FROM ls JOIN nbdc_application_component c
        ON c.appl_submit_id=ls.appl_submit_id AND c.key='use_dataset_id'
      WHERE c.value LIKE 'JGAD%'
    )
    SELECT DISTINCT appl_id, jgad
    FROM (SELECT * FROM up UNION ALL SELECT * FROM ev) z
    ORDER BY appl_id, jgad
  `, r => ({
    applId: str(r.appl_id),
    jgad: str(r.jgad),
  }))

export const extractDuPhase = async (): Promise<RawDuPhase[]> =>
  runQuery(`
    WITH du AS (SELECT DISTINCT ds_du_id FROM nbdc_application_master WHERE data_type=2),
    apprtrans AS (
      SELECT h.ds_du_id, min(h.history_date)::date AS approved_at
      FROM nbdc_phase_history h
      WHERE h.phase_type=160
      GROUP BY h.ds_du_id
    ),
    endtrans AS (
      SELECT h.ds_du_id, max(h.history_date)::date AS ended_date
      FROM nbdc_phase_history h
      JOIN current_nbdc_phase cp ON cp.ds_du_id=h.ds_du_id AND cp.phase_type=h.phase_type
      WHERE cp.phase_type IN (190,200,220)
      GROUP BY h.ds_du_id
    )
    SELECT du.ds_du_id, cp.phase_type, at.approved_at, up.expire_date, et.ended_date
    FROM du
    JOIN current_nbdc_phase cp ON cp.ds_du_id=du.ds_du_id
    LEFT JOIN apprtrans at ON at.ds_du_id=du.ds_du_id
    LEFT JOIN nbdc_use_period up ON up.ds_du_id=du.ds_du_id
    LEFT JOIN endtrans et ON et.ds_du_id=du.ds_du_id
    ORDER BY du.ds_du_id
  `, r => ({
    dsDuId: str(r.ds_du_id),
    phaseType: str(r.phase_type),
    approvedAt: dateStr(r.approved_at),
    expireDate: dateStr(r.expire_date),
    endedDate: dateStr(r.ended_date),
  }))

export const extractJgadHumId = async (): Promise<RawJgadHumId[]> =>
  runQuery(`
    SELECT DISTINCT jgad, hum_id FROM (
      SELECT a.accession AS jgad, na.hum_id
      FROM nbdc_application na
      JOIN submission_permission sp ON na.appl_id=sp.appl_id
      JOIN submission s ON sp.submission_id=s.submission_id
      JOIN entry e ON s.submission_id=e.submission_id
      JOIN relation r ON e.entry_id=r.entry_id
      JOIN accession a ON r.self=a.accession_id
      JOIN current_accession_status cas ON a.accession=cas.accession
      WHERE a.accession LIKE 'JGAD%'
        AND na.hum_id IS NOT NULL AND na.hum_id <> '' AND na.hum_id <> 'N/A'
        AND cas.accession_status = 2098186
      UNION
      SELECT a_jgad.accession AS jgad, na.hum_id
      FROM relation r_jgad
      JOIN accession a_jgad ON r_jgad.self = a_jgad.accession_id
      JOIN current_accession_status cas ON a_jgad.accession=cas.accession
      JOIN relation r_jgas_local
        ON r_jgad.entry_id = r_jgas_local.entry_id
      JOIN accession a_jgas
        ON r_jgas_local.self = a_jgas.accession_id
      JOIN relation r_jgas_remote
        ON a_jgas.accession_id = r_jgas_remote.self
        AND r_jgas_remote.entry_id != r_jgad.entry_id
      JOIN entry e ON r_jgas_remote.entry_id = e.entry_id
      JOIN submission s ON e.submission_id = s.submission_id
      JOIN submission_permission sp ON s.submission_id = sp.submission_id
      JOIN nbdc_application na ON sp.appl_id = na.appl_id
      WHERE a_jgad.accession LIKE 'JGAD%'
        AND a_jgas.accession LIKE 'JGAS%'
        AND na.hum_id IS NOT NULL AND na.hum_id <> '' AND na.hum_id <> 'N/A'
        AND cas.accession_status = 2098186
    ) combined
    ORDER BY jgad
  `, r => ({
    jgad: str(r.jgad),
    humId: str(r.hum_id),
  }))
