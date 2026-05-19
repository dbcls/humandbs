/**
 * JGA Shinsei DB query functions.
 *
 * Reference SQL: `apps/backend/jga-shinsei/scripts/dump-all-data.sh`.
 */
import { JGA_DB_SCHEMA, jgaSql } from "@/api/db-client/client"
import { NotFoundError } from "@/api/routes/errors"
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

export const listIds = async (
  prefix: ApplicationPrefix,
  page: number,
  limit: number,
): Promise<{ ids: string[]; total: number }> => {
  const offset = (page - 1) * limit
  const dataType = DATA_TYPE[prefix]
  const schema = jgaSql(JGA_DB_SCHEMA)

  const [countRows, idRows] = await Promise.all([
    jgaSql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM ${schema}.nbdc_application_master
      WHERE data_type = ${dataType}
    `,
    jgaSql<{ ds_du_id: string }[]>`
      SELECT ds_du_id
      FROM ${schema}.nbdc_application_master
      WHERE data_type = ${dataType}
      ORDER BY ds_du_id
      LIMIT ${limit} OFFSET ${offset}
    `,
  ])

  const total = countRows[0]?.count ?? 0
  const ids = idRows.map((r) => r.ds_du_id)
  return { ids, total }
}

export const fetchDsRaw = async (jdsIds: string[]): Promise<RawDsApplication[]> => {
  if (jdsIds.length === 0) return []
  const schema = jgaSql(JGA_DB_SCHEMA)

  const rows = await jgaSql<RawDsApplication[]>`
    WITH jds_base AS (
      SELECT DISTINCT
        nam.ds_du_id AS jds_id,
        na.appl_id,
        na.create_date
      FROM ${schema}.nbdc_application_master nam
      JOIN ${schema}.nbdc_application na ON nam.ds_du_id = na.ds_du_id
      WHERE nam.data_type = 1
        AND nam.ds_du_id = ANY(${jdsIds})
    ),
    -- Project jsub_ids / jga_ids over the submission_permission → entry → relation →
    -- accession chain. The ~12M-row "relation" table dominates the cost, so it must be
    -- scanned only once.
    jds_acc AS (
      SELECT
        na.ds_du_id AS jds_id,
        array_agg(DISTINCT substring(a.alias FROM 'JSUB[0-9]+'))
          FILTER (WHERE a.alias LIKE 'JSUB%') AS jsub_ids,
        array_agg(DISTINCT a.accession)
          FILTER (WHERE a.accession NOT LIKE 'JSUB%') AS jga_ids
      FROM ${schema}.submission_permission sp
      JOIN ${schema}.nbdc_application na ON sp.appl_id = na.appl_id
      JOIN ${schema}.entry e ON sp.submission_id = e.submission_id
      JOIN ${schema}.relation r ON e.entry_id = r.entry_id
      JOIN ${schema}.accession a ON r.self = a.accession_id
      WHERE na.ds_du_id = ANY(${jdsIds})
      GROUP BY na.ds_du_id
    ),
    -- hum_ids are read from nbdc_application.hum_id.
    jds_hum AS (
      SELECT
        nam.ds_du_id AS jds_id,
        array_agg(DISTINCT na.hum_id)
          FILTER (WHERE na.hum_id IS NOT NULL AND na.hum_id NOT IN ('', 'N/A')) AS hum_ids
      FROM ${schema}.nbdc_application_master nam
      JOIN ${schema}.nbdc_application na ON nam.ds_du_id = na.ds_du_id
      WHERE nam.data_type = 1
        AND nam.ds_du_id = ANY(${jdsIds})
      GROUP BY nam.ds_du_id
    ),
    jds_components AS (
      SELECT
        jb.jds_id,
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
      GROUP BY jb.jds_id
    ),
    jds_status AS (
      SELECT
        jb.jds_id,
        COALESCE(
          json_agg(
            json_build_object('status', sh.appl_status_type, 'date', sh.history_date)
            ORDER BY sh.history_date
          ) FILTER (WHERE sh.appl_status_history_id IS NOT NULL),
          '[]'::json
        ) AS status_history
      FROM jds_base jb
      LEFT JOIN ${schema}.nbdc_application_status_history sh ON jb.appl_id = sh.appl_id
      GROUP BY jb.jds_id
    ),
    jds_submit AS (
      SELECT
        jb.jds_id,
        MIN(ns.submit_date) AS submit_date
      FROM jds_base jb
      LEFT JOIN ${schema}.nbdc_application_submit ns ON jb.appl_id = ns.appl_id
      GROUP BY jb.jds_id
    )
    SELECT
      jb.jds_id,
      COALESCE(jacc.jsub_ids, ARRAY[]::text[]) AS jsub_ids,
      COALESCE(jhum.hum_ids, ARRAY[]::text[]) AS hum_ids,
      COALESCE(jacc.jga_ids, ARRAY[]::text[]) AS jga_ids,
      comp.components,
      stat.status_history,
      sub.submit_date,
      jb.create_date
    FROM jds_base jb
    LEFT JOIN jds_acc jacc ON jb.jds_id = jacc.jds_id
    LEFT JOIN jds_hum jhum ON jb.jds_id = jhum.jds_id
    LEFT JOIN jds_components comp ON jb.jds_id = comp.jds_id
    LEFT JOIN jds_status stat ON jb.jds_id = stat.jds_id
    LEFT JOIN jds_submit sub ON jb.jds_id = sub.jds_id
    ORDER BY jb.jds_id
  `

  return rows
}

export const fetchDuRaw = async (jduIds: string[]): Promise<RawDuApplication[]> => {
  if (jduIds.length === 0) return []
  const schema = jgaSql(JGA_DB_SCHEMA)

  const rows = await jgaSql<RawDuApplication[]>`
    WITH jdu_base AS (
      SELECT DISTINCT
        na.ds_du_id AS jdu_id,
        na.appl_id,
        na.create_date
      FROM ${schema}.nbdc_application na
      WHERE na.ds_du_id LIKE 'J-DU%'
        AND na.ds_du_id = ANY(${jduIds})
    ),
    -- Project jgad_ids / jgas_ids over the use_permission → accession → relation →
    -- parent_acc chain. The "relation" walk happens once per list page.
    jdu_acc AS (
      SELECT
        jb.jdu_id,
        array_agg(DISTINCT a.accession)
          FILTER (WHERE a.accession LIKE 'JGAD%') AS jgad_ids,
        array_agg(DISTINCT parent_acc.accession)
          FILTER (WHERE parent_acc.accession LIKE 'JGAS%') AS jgas_ids
      FROM jdu_base jb
      LEFT JOIN ${schema}.use_permission up ON jb.appl_id = up.appl_id
      LEFT JOIN ${schema}.accession a ON up.dataset_id = a.accession_id
      LEFT JOIN ${schema}.relation r ON a.accession_id = r.self
      LEFT JOIN ${schema}.accession parent_acc ON r.parent = parent_acc.accession_id
      GROUP BY jb.jdu_id
    ),
    -- hum_ids are read from nbdc_application.hum_id.
    jdu_hum AS (
      SELECT
        na.ds_du_id AS jdu_id,
        array_agg(DISTINCT na.hum_id)
          FILTER (WHERE na.hum_id IS NOT NULL AND na.hum_id NOT IN ('', 'N/A')) AS hum_ids
      FROM ${schema}.nbdc_application na
      WHERE na.ds_du_id LIKE 'J-DU%'
        AND na.ds_du_id = ANY(${jduIds})
      GROUP BY na.ds_du_id
    ),
    jdu_components AS (
      SELECT
        jb.jdu_id,
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
      GROUP BY jb.jdu_id
    ),
    jdu_status AS (
      SELECT
        jb.jdu_id,
        COALESCE(
          json_agg(
            json_build_object('status', sh.appl_status_type, 'date', sh.history_date)
            ORDER BY sh.history_date
          ) FILTER (WHERE sh.appl_status_history_id IS NOT NULL),
          '[]'::json
        ) AS status_history
      FROM jdu_base jb
      LEFT JOIN ${schema}.nbdc_application_status_history sh ON jb.appl_id = sh.appl_id
      GROUP BY jb.jdu_id
    ),
    jdu_submit AS (
      SELECT
        jb.jdu_id,
        MIN(ns.submit_date) AS submit_date
      FROM jdu_base jb
      LEFT JOIN ${schema}.nbdc_application_submit ns ON jb.appl_id = ns.appl_id
      GROUP BY jb.jdu_id
    )
    SELECT
      jb.jdu_id,
      COALESCE(jacc.jgad_ids, ARRAY[]::text[]) AS jgad_ids,
      COALESCE(jacc.jgas_ids, ARRAY[]::text[]) AS jgas_ids,
      COALESCE(jhum.hum_ids, ARRAY[]::text[]) AS hum_ids,
      comp.components,
      stat.status_history,
      sub.submit_date,
      jb.create_date
    FROM jdu_base jb
    LEFT JOIN jdu_acc jacc ON jb.jdu_id = jacc.jdu_id
    LEFT JOIN jdu_hum jhum ON jb.jdu_id = jhum.jdu_id
    LEFT JOIN jdu_components comp ON jb.jdu_id = comp.jdu_id
    LEFT JOIN jdu_status stat ON jb.jdu_id = stat.jdu_id
    LEFT JOIN jdu_submit sub ON jb.jdu_id = sub.jdu_id
    ORDER BY jb.jdu_id
  `

  return rows
}

const listApplications = async <Raw, Out>(
  prefix: ApplicationPrefix,
  page: number,
  limit: number,
  fetchRaw: (ids: string[]) => Promise<Raw[]>,
  keyOf: (r: Raw) => string,
  parse: (r: Raw) => Out,
): Promise<{ hits: Out[]; total: number }> => {
  const { ids, total } = await listIds(prefix, page, limit)
  const raws = await fetchRaw(ids)
  const byId = new Map(raws.map((r) => [keyOf(r), r]))
  const hits = ids
    .map((id) => byId.get(id))
    .filter((r): r is Raw => r !== undefined)
    .map(parse)
  return { hits, total }
}

const getApplication = async <Raw, Out>(
  id: string,
  fetchRaw: (ids: string[]) => Promise<Raw[]>,
  parse: (r: Raw) => Out,
  resourceName: string,
): Promise<Out> => {
  const raws = await fetchRaw([id])
  if (raws.length === 0) throw NotFoundError.forResource(resourceName, id)
  return parse(raws[0])
}

const parseDs = (r: RawDsApplication): DsApplicationTransformed =>
  DsApplicationTransformedSchema.parse(transformDsApplication(r))

const parseDu = (r: RawDuApplication): DuApplicationTransformed =>
  DuApplicationTransformedSchema.parse(transformDuApplication(r))

export const listDsApplications = (
  page: number,
  limit: number,
): Promise<{ hits: DsApplicationTransformed[]; total: number }> =>
  listApplications("J-DS", page, limit, fetchDsRaw, (r) => r.jds_id, parseDs)

export const getDsApplication = (jdsId: string): Promise<DsApplicationTransformed> =>
  getApplication(jdsId, fetchDsRaw, parseDs, "DS Application")

export const listDuApplications = (
  page: number,
  limit: number,
): Promise<{ hits: DuApplicationTransformed[]; total: number }> =>
  listApplications("J-DU", page, limit, fetchDuRaw, (r) => r.jdu_id, parseDu)

export const getDuApplication = (jduId: string): Promise<DuApplicationTransformed> =>
  getApplication(jduId, fetchDuRaw, parseDu, "DU Application")
