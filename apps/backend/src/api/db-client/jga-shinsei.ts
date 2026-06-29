/**
 * JGA Shinsei DB query functions.
 *
 * All queries operate at the version (appl_id) level, not the master
 * (ds_du_id) level. A version is identified externally by its
 * applIdStr (e.g., "J-DS002494-001").
 */
import { JGA_DB_SCHEMA, jgaSql } from "@/api/db-client/client"
import { NotFoundError } from "@/api/errors"
import {
  transformDsApplication,
  transformDuApplication,
} from "@/crawler/processors/jga-shinsei/transform"
import {
  DsApplicationTransformedSchema,
  DuApplicationTransformedSchema,
} from "@/crawler/types/jga-shinsei"
import type {
  DsApplicationTransformed,
  DuApplicationTransformed,
  RawDsApplication,
  RawDuApplication,
} from "@/crawler/types/jga-shinsei"

const DATA_TYPE = { "J-DS": 1, "J-DU": 2 } as const
type ApplicationPrefix = keyof typeof DATA_TYPE

export const parseApplIdStr = (
  applIdStr: string,
): { dsDuId: string; applVersion: number } => {
  const match = /^(J-D[SU]\d+)-(\d{3})$/.exec(applIdStr)
  if (!match) throw new Error(`Invalid applIdStr: ${applIdStr}`)
  return { dsDuId: match[1], applVersion: parseInt(match[2], 10) }
}

export const listVersions = async (
  prefix: ApplicationPrefix,
  page: number,
  limit: number,
  dsDuId?: string,
): Promise<{ applIds: number[]; total: number }> => {
  const offset = (page - 1) * limit
  const dataType = DATA_TYPE[prefix]
  const schema = jgaSql(JGA_DB_SCHEMA)

  const [countRows, idRows] = dsDuId
    ? await Promise.all([
      jgaSql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM ${schema}.nbdc_application na
        JOIN ${schema}.nbdc_application_master nam ON na.ds_du_id = nam.ds_du_id
        WHERE nam.data_type = ${dataType}
          AND na.ds_du_id = ${dsDuId}
      `,
      jgaSql<{ appl_id: number }[]>`
        SELECT na.appl_id
        FROM ${schema}.nbdc_application na
        JOIN ${schema}.nbdc_application_master nam ON na.ds_du_id = nam.ds_du_id
        WHERE nam.data_type = ${dataType}
          AND na.ds_du_id = ${dsDuId}
        ORDER BY na.ds_du_id, na.appl_version
        LIMIT ${limit} OFFSET ${offset}
      `,
    ])
    : await Promise.all([
      jgaSql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM ${schema}.nbdc_application na
        JOIN ${schema}.nbdc_application_master nam ON na.ds_du_id = nam.ds_du_id
        WHERE nam.data_type = ${dataType}
      `,
      jgaSql<{ appl_id: number }[]>`
        SELECT na.appl_id
        FROM ${schema}.nbdc_application na
        JOIN ${schema}.nbdc_application_master nam ON na.ds_du_id = nam.ds_du_id
        WHERE nam.data_type = ${dataType}
        ORDER BY na.ds_du_id, na.appl_version
        LIMIT ${limit} OFFSET ${offset}
      `,
    ])

  const total = countRows[0]?.count ?? 0
  const applIds = idRows.map((r) => r.appl_id)
  return { applIds, total }
}

const resolveApplId = async (
  dsDuId: string,
  applVersion: number,
): Promise<number> => {
  const schema = jgaSql(JGA_DB_SCHEMA)
  const rows = await jgaSql<{ appl_id: number }[]>`
    SELECT appl_id
    FROM ${schema}.nbdc_application
    WHERE ds_du_id = ${dsDuId} AND appl_version = ${applVersion}
  `
  if (rows.length === 0)
    throw NotFoundError.forResource(
      "Application",
      `${dsDuId}-${String(applVersion).padStart(3, "0")}`,
    )
  return rows[0].appl_id
}

export const fetchDsRaw = async (applIds: number[]): Promise<RawDsApplication[]> => {
  if (applIds.length === 0) return []
  const schema = jgaSql(JGA_DB_SCHEMA)

  const rows = await jgaSql<RawDsApplication[]>`
    WITH jds_base AS (
      SELECT
        na.ds_du_id AS jds_id,
        na.appl_id,
        na.appl_version,
        na.application_type,
        na.hum_id,
        na.create_date
      FROM ${schema}.nbdc_application na
      WHERE na.appl_id = ANY(${applIds})
    ),
    jds_acc AS (
      SELECT
        jb.appl_id,
        array_agg(DISTINCT substring(a.alias FROM 'JSUB[0-9]+'))
          FILTER (WHERE a.alias LIKE 'JSUB%') AS jsub_ids,
        array_agg(DISTINCT a.accession)
          FILTER (WHERE a.accession NOT LIKE 'JSUB%') AS jga_ids
      FROM jds_base jb
      LEFT JOIN ${schema}.submission_permission sp ON jb.appl_id = sp.appl_id
      LEFT JOIN ${schema}.entry e ON sp.submission_id = e.submission_id
      LEFT JOIN ${schema}.relation r ON e.entry_id = r.entry_id
      LEFT JOIN ${schema}.accession a ON r.self = a.accession_id
      GROUP BY jb.appl_id
    ),
    jds_components AS (
      SELECT
        jb.appl_id,
        COALESCE(
          json_agg(
            json_build_object('key', nc.key, 'value', nc.value)
            ORDER BY nc.t_order
          ) FILTER (WHERE nc.appl_component_id IS NOT NULL),
          '[]'::json
        ) AS components
      FROM jds_base jb
      LEFT JOIN ${schema}.nbdc_application_submit ns ON jb.appl_id = ns.appl_id
      LEFT JOIN ${schema}.nbdc_application_component nc ON ns.appl_submit_id = nc.appl_submit_id
      GROUP BY jb.appl_id
    ),
    jds_status AS (
      SELECT
        jb.appl_id,
        COALESCE(
          json_agg(
            json_build_object('status', sh.appl_status_type, 'date', sh.history_date)
            ORDER BY sh.history_date
          ) FILTER (WHERE sh.appl_status_history_id IS NOT NULL),
          '[]'::json
        ) AS status_history
      FROM jds_base jb
      LEFT JOIN ${schema}.nbdc_application_status_history sh ON jb.appl_id = sh.appl_id
      GROUP BY jb.appl_id
    ),
    jds_submit AS (
      SELECT
        jb.appl_id,
        MIN(ns.submit_date) AS submit_date
      FROM jds_base jb
      LEFT JOIN ${schema}.nbdc_application_submit ns ON jb.appl_id = ns.appl_id
      GROUP BY jb.appl_id
    )
    SELECT
      jb.jds_id,
      jb.appl_id,
      jb.appl_version,
      jb.application_type,
      COALESCE(jacc.jsub_ids, ARRAY[]::text[]) AS jsub_ids,
      CASE WHEN jb.hum_id IS NOT NULL AND jb.hum_id NOT IN ('', 'N/A')
        THEN ARRAY[jb.hum_id] ELSE ARRAY[]::text[] END AS hum_ids,
      COALESCE(jacc.jga_ids, ARRAY[]::text[]) AS jga_ids,
      comp.components,
      stat.status_history,
      sub.submit_date,
      jb.create_date
    FROM jds_base jb
    LEFT JOIN jds_acc jacc ON jb.appl_id = jacc.appl_id
    LEFT JOIN jds_components comp ON jb.appl_id = comp.appl_id
    LEFT JOIN jds_status stat ON jb.appl_id = stat.appl_id
    LEFT JOIN jds_submit sub ON jb.appl_id = sub.appl_id
    ORDER BY jb.jds_id, jb.appl_version
  `

  return rows
}

export const fetchDuRaw = async (applIds: number[]): Promise<RawDuApplication[]> => {
  if (applIds.length === 0) return []
  const schema = jgaSql(JGA_DB_SCHEMA)

  const rows = await jgaSql<RawDuApplication[]>`
    WITH jdu_base AS (
      SELECT
        na.ds_du_id AS jdu_id,
        na.appl_id,
        na.appl_version,
        na.application_type,
        na.hum_id,
        na.create_date
      FROM ${schema}.nbdc_application na
      WHERE na.appl_id = ANY(${applIds})
    ),
    jdu_acc AS (
      SELECT
        jb.appl_id,
        array_agg(DISTINCT a.accession)
          FILTER (WHERE a.accession LIKE 'JGAD%') AS jgad_ids,
        array_agg(DISTINCT parent_acc.accession)
          FILTER (WHERE parent_acc.accession LIKE 'JGAS%') AS jgas_ids
      FROM jdu_base jb
      LEFT JOIN ${schema}.use_permission up ON jb.appl_id = up.appl_id
      LEFT JOIN ${schema}.accession a ON up.dataset_id = a.accession_id
      LEFT JOIN ${schema}.relation r ON a.accession_id = r.self
      LEFT JOIN ${schema}.accession parent_acc ON r.parent = parent_acc.accession_id
      GROUP BY jb.appl_id
    ),
    jdu_components AS (
      SELECT
        jb.appl_id,
        COALESCE(
          json_agg(
            json_build_object('key', nc.key, 'value', nc.value)
            ORDER BY nc.t_order
          ) FILTER (WHERE nc.appl_component_id IS NOT NULL),
          '[]'::json
        ) AS components
      FROM jdu_base jb
      LEFT JOIN ${schema}.nbdc_application_submit ns ON jb.appl_id = ns.appl_id
      LEFT JOIN ${schema}.nbdc_application_component nc ON ns.appl_submit_id = nc.appl_submit_id
      GROUP BY jb.appl_id
    ),
    jdu_status AS (
      SELECT
        jb.appl_id,
        COALESCE(
          json_agg(
            json_build_object('status', sh.appl_status_type, 'date', sh.history_date)
            ORDER BY sh.history_date
          ) FILTER (WHERE sh.appl_status_history_id IS NOT NULL),
          '[]'::json
        ) AS status_history
      FROM jdu_base jb
      LEFT JOIN ${schema}.nbdc_application_status_history sh ON jb.appl_id = sh.appl_id
      GROUP BY jb.appl_id
    ),
    jdu_submit AS (
      SELECT
        jb.appl_id,
        MIN(ns.submit_date) AS submit_date
      FROM jdu_base jb
      LEFT JOIN ${schema}.nbdc_application_submit ns ON jb.appl_id = ns.appl_id
      GROUP BY jb.appl_id
    )
    SELECT
      jb.jdu_id,
      jb.appl_id,
      jb.appl_version,
      jb.application_type,
      COALESCE(jacc.jgad_ids, ARRAY[]::text[]) AS jgad_ids,
      COALESCE(jacc.jgas_ids, ARRAY[]::text[]) AS jgas_ids,
      CASE WHEN jb.hum_id IS NOT NULL AND jb.hum_id NOT IN ('', 'N/A')
        THEN ARRAY[jb.hum_id] ELSE ARRAY[]::text[] END AS hum_ids,
      comp.components,
      stat.status_history,
      sub.submit_date,
      jb.create_date
    FROM jdu_base jb
    LEFT JOIN jdu_acc jacc ON jb.appl_id = jacc.appl_id
    LEFT JOIN jdu_components comp ON jb.appl_id = comp.appl_id
    LEFT JOIN jdu_status stat ON jb.appl_id = stat.appl_id
    LEFT JOIN jdu_submit sub ON jb.appl_id = sub.appl_id
    ORDER BY jb.jdu_id, jb.appl_version
  `

  return rows
}

const listApplications = async <Raw, Out>(
  prefix: ApplicationPrefix,
  page: number,
  limit: number,
  dsDuId: string | undefined,
  fetchRaw: (ids: number[]) => Promise<Raw[]>,
  keyOf: (r: Raw) => number,
  parse: (r: Raw) => Out,
): Promise<{ hits: Out[]; total: number }> => {
  const { applIds, total } = await listVersions(prefix, page, limit, dsDuId)
  const raws = await fetchRaw(applIds)
  const byId = new Map(raws.map((r) => [keyOf(r), r]))
  const hits = applIds
    .map((id) => byId.get(id))
    .filter((r): r is Raw => r !== undefined)
    .map(parse)
  return { hits, total }
}

const getApplicationByApplId = async <Raw, Out>(
  applId: number,
  applIdStr: string,
  fetchRaw: (ids: number[]) => Promise<Raw[]>,
  parse: (r: Raw) => Out,
  resourceName: string,
): Promise<Out> => {
  const raws = await fetchRaw([applId])
  if (raws.length === 0) throw NotFoundError.forResource(resourceName, applIdStr)
  return parse(raws[0])
}

const parseDs = (r: RawDsApplication): DsApplicationTransformed =>
  DsApplicationTransformedSchema.parse(transformDsApplication(r))

const parseDu = (r: RawDuApplication): DuApplicationTransformed =>
  DuApplicationTransformedSchema.parse(transformDuApplication(r))

export const listDsApplications = (
  page: number,
  limit: number,
  dsDuId?: string,
): Promise<{ hits: DsApplicationTransformed[]; total: number }> =>
  listApplications("J-DS", page, limit, dsDuId, fetchDsRaw, (r) => r.appl_id, parseDs)

export const getDsApplication = async (applIdStr: string): Promise<DsApplicationTransformed> => {
  const { dsDuId, applVersion } = parseApplIdStr(applIdStr)
  const applId = await resolveApplId(dsDuId, applVersion)
  return getApplicationByApplId(applId, applIdStr, fetchDsRaw, parseDs, "DS Application")
}

export const listDuApplications = (
  page: number,
  limit: number,
  dsDuId?: string,
): Promise<{ hits: DuApplicationTransformed[]; total: number }> =>
  listApplications("J-DU", page, limit, dsDuId, fetchDuRaw, (r) => r.appl_id, parseDu)

export const getDuApplication = async (applIdStr: string): Promise<DuApplicationTransformed> => {
  const { dsDuId, applVersion } = parseApplIdStr(applIdStr)
  const applId = await resolveApplId(dsDuId, applVersion)
  return getApplicationByApplId(applId, applIdStr, fetchDuRaw, parseDu, "DU Application")
}
