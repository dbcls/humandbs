/**
 * A stand-in for the part of the JGA application system the upstream queries
 * read, built in a schema of its own in the test database.
 *
 * Only the columns the queries name are here, with the types the system gives
 * them. The `current_*` views are defined the way the system defines them: the
 * history joined to its own latest timestamp per key, so two rows at the same
 * moment come out twice there as well.
 */

import { sql } from "drizzle-orm"

import type { Executor } from "~/db/client.server"

export const FIXTURE_SCHEMA = "jgasys_fixture"

const DDL = `
  CREATE TABLE accession (accession_id bigint PRIMARY KEY, alias text, accession text NOT NULL);
  CREATE TABLE accession_history (accession_id bigint NOT NULL, accession_status integer NOT NULL, status_date timestamptz NOT NULL);
  CREATE TABLE entry (entry_id bigint PRIMARY KEY, submission_id bigint NOT NULL, entry_version integer NOT NULL);
  CREATE TABLE relation (entry_id bigint NOT NULL, self bigint NOT NULL, parent bigint);
  CREATE TABLE submission_permission (appl_id bigint NOT NULL, submission_id bigint NOT NULL);
  CREATE TABLE nbdc_application_master (ds_du_id varchar(10) NOT NULL, data_type integer NOT NULL);
  CREATE TABLE nbdc_application (
    appl_id bigint PRIMARY KEY, ds_du_id varchar(10) NOT NULL, appl_version integer NOT NULL,
    application_type integer NOT NULL, data_access integer, hum_id text
  );
  CREATE TABLE nbdc_application_status_history (
    appl_status_history_id bigserial PRIMARY KEY, appl_id bigint NOT NULL,
    appl_status_type integer NOT NULL, history_date timestamptz NOT NULL
  );
  CREATE TABLE nbdc_phase_history (
    phase_id bigserial PRIMARY KEY, ds_du_id varchar(10) NOT NULL,
    phase_type integer NOT NULL, history_date timestamptz NOT NULL
  );
  CREATE TABLE nbdc_application_submit (appl_submit_id bigint PRIMARY KEY, appl_id bigint NOT NULL, submit_date timestamptz);
  CREATE TABLE nbdc_application_component (appl_submit_id bigint NOT NULL, key text NOT NULL, value text, t_order integer NOT NULL DEFAULT -1);
  CREATE TABLE use_permission (appl_id bigint NOT NULL, dataset_id bigint NOT NULL);
  CREATE TABLE nbdc_use_period (ds_du_id varchar(10) NOT NULL, expire_date date);

  CREATE VIEW current_entry AS
    SELECT entry.entry_id, entry.submission_id, entry.entry_version
    FROM (SELECT submission_id, max(entry_version) AS entry_version FROM entry GROUP BY submission_id) latest
    LEFT JOIN entry USING (submission_id, entry_version);
  CREATE VIEW current_nbdc_phase AS
    SELECT nbdc_phase_history.phase_id, nbdc_phase_history.ds_du_id, nbdc_phase_history.phase_type, nbdc_phase_history.history_date
    FROM (SELECT ds_du_id, max(history_date) AS history_date FROM nbdc_phase_history GROUP BY ds_du_id) latest
    LEFT JOIN nbdc_phase_history USING (ds_du_id, history_date);
  CREATE VIEW current_nbdc_application_status AS
    SELECT nbdc_application_status_history.appl_status_history_id, nbdc_application_status_history.appl_id,
           nbdc_application_status_history.appl_status_type, nbdc_application_status_history.history_date,
           nbdc_application.ds_du_id, nbdc_application.appl_version, nbdc_application.application_type,
           nbdc_application.data_access, nbdc_application.hum_id
    FROM (SELECT appl_id, max(history_date) AS history_date FROM nbdc_application_status_history GROUP BY appl_id) latest
    LEFT JOIN nbdc_application_status_history USING (appl_id, history_date)
    LEFT JOIN nbdc_application USING (appl_id);
`

/**
 * Replaces the schema with an empty one. The role the application connects as
 * may read it, as the upstream reader's account may read the real one.
 */
export async function createApplicationSystem(owner: Executor): Promise<void> {
  await owner.execute(sql.raw(`
    DROP SCHEMA IF EXISTS ${FIXTURE_SCHEMA} CASCADE;
    CREATE SCHEMA ${FIXTURE_SCHEMA};
    SET LOCAL search_path = ${FIXTURE_SCHEMA};
    ${DDL}
    GRANT USAGE ON SCHEMA ${FIXTURE_SCHEMA} TO PUBLIC;
    GRANT SELECT ON ALL TABLES IN SCHEMA ${FIXTURE_SCHEMA} TO PUBLIC;
  `))
}

export async function dropApplicationSystem(owner: Executor): Promise<void> {
  await owner.execute(sql.raw(`DROP SCHEMA IF EXISTS ${FIXTURE_SCHEMA} CASCADE`))
}

async function insert(owner: Executor, table: string, row: Record<string, unknown>): Promise<void> {
  const columns = Object.keys(row)
  await owner.execute(sql`
    INSERT INTO ${sql.identifier(FIXTURE_SCHEMA)}.${sql.identifier(table)}
      (${sql.join(columns.map((column) => sql.identifier(column)), sql`, `)})
    VALUES (${sql.join(columns.map((column) => sql`${row[column]}`), sql`, `)})`)
}

/** Branch statuses. */
export const SUBMITTED = 20
export const REJECTED = 50
export const APPROVED = 60
export const DISCARDED = 80

/** Branch types of a usage project. */
export const INITIAL = 10
export const ADDITION = 30
export const EXTENSION = 40
export const CLOSING = 60

/** Phases of a usage project. */
export const PHASE = {
  submitted: 120,
  reviewing: 140,
  approved: 160,
  discarded: 180,
  closed: 190,
  closedKeepingSecondaryData: 200,
  notReported: 210,
  expired: 220,
} as const

export interface UsageBranch {
  type: number
  /** Status and the moment it was entered, oldest first. */
  statuses: [number, string][]
  /** JGAD accessions this branch grants, registered with `dataset` first. */
  grants?: string[]
}

export interface UsageProject {
  id: string
  /** Phase and the moment it was entered, oldest first. */
  phases: [number, string][]
  expireDate: string
  /** In branch order; the first is the initial application. */
  branches: UsageBranch[]
}

/**
 * The initial application's form. A country and an English affiliation are
 * stated, so the rows need no filling in from other branches.
 */
const STATED: Record<string, string> = {
  pi_last_name: "田中",
  pi_first_name: "太郎",
  pi_last_name_en: "Tanaka",
  pi_first_name_en: "Taro",
  pi_institution: "東京大学",
  pi_institution_en: "The University of Tokyo",
  pi_country_en: "Japan",
  use_study_title: "ゲノム解析",
  use_study_title_en: "A genome study",
}

export interface ApplicationSystem {
  /**
   * A JGAD registered by a data submission whose branch carries `humLabel`, so
   * the hum resolution reaches it through the accession's alias.
   */
  dataset: (accession: string, humLabel: string) => Promise<void>
  usage: (project: UsageProject) => Promise<void>
}

/**
 * Ids are unique within what one call builds, so each test builds its own and
 * shares nothing with the others.
 */
export function applicationSystem(owner: Executor): ApplicationSystem {
  let nextId = 1
  const id = (): number => nextId++
  const accessionIds = new Map<string, number>()

  async function dataset(accession: string, humLabel: string): Promise<void> {
    const accessionId = id()
    const submissionId = id()
    const applId = id()
    accessionIds.set(accession, accessionId)
    await insert(owner, "accession", { accession_id: accessionId, alias: `JSUB${String(submissionId).padStart(6, "0")}`, accession })
    await insert(owner, "nbdc_application", {
      appl_id: applId, ds_du_id: `J-DS${String(applId).padStart(6, "0")}`, appl_version: 1, application_type: INITIAL, hum_id: humLabel,
    })
    await insert(owner, "submission_permission", { appl_id: applId, submission_id: submissionId })
  }

  async function usage(project: UsageProject): Promise<void> {
    await insert(owner, "nbdc_application_master", { ds_du_id: project.id, data_type: 2 })
    await insert(owner, "nbdc_use_period", { ds_du_id: project.id, expire_date: project.expireDate })
    for (const [phase, at] of project.phases) {
      await insert(owner, "nbdc_phase_history", { ds_du_id: project.id, phase_type: phase, history_date: at })
    }
    for (const [index, branch] of project.branches.entries()) {
      const applId = id()
      await insert(owner, "nbdc_application", {
        appl_id: applId, ds_du_id: project.id, appl_version: index + 1, application_type: branch.type,
      })
      for (const [status, at] of branch.statuses) {
        await insert(owner, "nbdc_application_status_history", { appl_id: applId, appl_status_type: status, history_date: at })
      }
      const submitted = branch.statuses.find(([status]) => status === SUBMITTED)?.[1] ?? null
      const submitId = id()
      await insert(owner, "nbdc_application_submit", { appl_submit_id: submitId, appl_id: applId, submit_date: submitted })
      if (branch.type === INITIAL) {
        for (const [key, value] of Object.entries(STATED)) {
          await insert(owner, "nbdc_application_component", { appl_submit_id: submitId, key, value, t_order: -1 })
        }
      }
      for (const accession of branch.grants ?? []) {
        const datasetId = accessionIds.get(accession)
        if (datasetId === undefined) throw new Error(`${accession} is not registered`)
        await insert(owner, "use_permission", { appl_id: applId, dataset_id: datasetId })
      }
    }
  }

  return { dataset, usage }
}
