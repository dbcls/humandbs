import type { Pool } from "pg"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import { closePools, getOwnerDb } from "~/db/client.server"

import {
  ADDITION,
  APPROVED,
  applicationSystem,
  CLOSING,
  createApplicationSystem,
  DISCARDED,
  dropApplicationSystem,
  EXTENSION,
  FIXTURE_SCHEMA,
  INITIAL,
  PHASE,
  REJECTED,
  SUBMITTED,
  type ApplicationSystem,
  type UsageBranch,
} from "./_application-db-fixture"
import { fetchCauEntries, openApplicationDb } from "./application-db.server"

afterAll(async () => {
  await closePools()
})

/**
 * The pool is pointed at the test database, whose role may write: what is
 * being held down is that the pool itself refuses to, whatever the role it is
 * given could do.
 */
describe("the application database's pool", () => {
  it("reads, and refuses every write even under a role that could write", async () => {
    const pool = openApplicationDb({ url: process.env.HUMANDBS_DATABASE_URL ?? "", schema: "public" })
    try {
      expect((await pool.query("SELECT 1 AS one")).rows).toEqual([{ one: 1 }])
      await expect(pool.query("CREATE TABLE written (id integer)")).rejects.toThrow(/read-only transaction/)
      await expect(pool.query("DELETE FROM session")).rejects.toThrow(/read-only transaction/)
    } finally {
      await pool.end()
    }
  })
})

/**
 * The controlled-access users read from a stand-in of the application system,
 * one project at a time: which projects are listed, and the period of data use
 * decided by approvals.
 */
describe("fetchCauEntries", () => {
  const owner = getOwnerDb()
  let pool: Pool
  let upstream: ApplicationSystem

  beforeEach(async () => {
    await createApplicationSystem(owner)
    upstream = applicationSystem(owner)
    await upstream.dataset("JGAD000001", "hum0001")
    await upstream.dataset("JGAD000002", "hum0001")
    await upstream.dataset("JGAD000003", "hum0001")
    await upstream.dataset("JGAD000004", "hum0002")
    pool = openApplicationDb({ url: process.env.HUMANDBS_DATABASE_URL ?? "", schema: FIXTURE_SCHEMA })
  })

  afterEach(async () => {
    await pool.end()
  })

  afterAll(async () => {
    await dropApplicationSystem(owner)
  })

  function initial(submitted: string, approved: string, grants = ["JGAD000001"]): UsageBranch {
    return { type: INITIAL, statuses: [[SUBMITTED, submitted], [APPROVED, approved]], grants }
  }

  function closing(submitted: string, approved: string): UsageBranch {
    return { type: CLOSING, statuses: [[SUBMITTED, submitted], [APPROVED, approved]] }
  }

  async function periods(): Promise<Record<string, [string | null, string | null]>> {
    const rows = await fetchCauEntries(pool, FIXTURE_SCHEMA)
    return Object.fromEntries(rows.map((row) => [row.applicationId, [row.periodStart, row.periodEnd]]))
  }

  it("starts on the day the initial application was approved in Japan time, and an extension approved after the expiry does not move it", async () => {
    await upstream.usage({
      id: "J-DU000001",
      phases: [
        [PHASE.submitted, "2020-03-01T10:00:00+09:00"],
        [PHASE.approved, "2020-03-31T15:30:00Z"],
        [PHASE.expired, "2021-04-01T20:00:00+09:00"],
        [PHASE.approved, "2021-04-20T10:00:00+09:00"],
      ],
      expireDate: "2025-03-31",
      branches: [
        initial("2020-03-01T10:00:00+09:00", "2020-03-31T15:30:00Z"),
        { type: EXTENSION, statuses: [[SUBMITTED, "2021-03-25T10:00:00+09:00"], [APPROVED, "2021-04-20T10:00:00+09:00"]] },
      ],
    })
    expect(await periods()).toEqual({ "J-DU000001": ["2020-04-01", "2025-03-31"] })
  })

  it("ends on the expiry while the use is ongoing, overdue with a report, or past the expiry with no closing report approved", async () => {
    const approvedAt = "2023-04-03T10:00:00+09:00"
    await upstream.usage({
      id: "J-DU000001",
      phases: [[PHASE.approved, approvedAt]],
      expireDate: "2027-03-31",
      branches: [initial(approvedAt, approvedAt)],
    })
    await upstream.usage({
      id: "J-DU000002",
      phases: [[PHASE.approved, approvedAt], [PHASE.notReported, "2024-04-04T20:00:00+09:00"]],
      expireDate: "2027-06-30",
      branches: [initial(approvedAt, approvedAt)],
    })
    await upstream.usage({
      id: "J-DU000003",
      phases: [[PHASE.approved, approvedAt], [PHASE.expired, "2024-04-01T20:00:00+09:00"]],
      expireDate: "2024-03-31",
      branches: [initial(approvedAt, approvedAt)],
    })
    expect(await periods()).toEqual({
      "J-DU000001": ["2023-04-03", "2027-03-31"],
      "J-DU000002": ["2023-04-03", "2027-06-30"],
      "J-DU000003": ["2023-04-03", "2024-03-31"],
    })
  })

  it("ends on the day a closing report was approved in Japan time, when that is before the expiry", async () => {
    const approvedAt = "2023-04-03T10:00:00+09:00"
    await upstream.usage({
      id: "J-DU000001",
      phases: [[PHASE.approved, approvedAt], [PHASE.closed, "2024-03-12T15:10:00Z"]],
      expireDate: "2024-03-31",
      branches: [initial(approvedAt, approvedAt), closing("2024-03-10T10:00:00+09:00", "2024-03-12T15:10:00Z")],
    })
    expect(await periods()).toEqual({ "J-DU000001": ["2023-04-03", "2024-03-13"] })
  })

  it("ends on the approval of a closing report that came after the expiry, whether it was submitted by the expiry or years later", async () => {
    await upstream.usage({
      id: "J-DU000001",
      phases: [
        [PHASE.approved, "2023-04-03T10:00:00+09:00"],
        [PHASE.expired, "2024-04-01T20:00:00+09:00"],
        [PHASE.closedKeepingSecondaryData, "2024-05-01T10:00:00+09:00"],
      ],
      expireDate: "2024-03-31",
      branches: [
        initial("2023-04-03T10:00:00+09:00", "2023-04-03T10:00:00+09:00"),
        closing("2024-03-31T17:00:00+09:00", "2024-05-01T10:00:00+09:00"),
      ],
    })
    await upstream.usage({
      id: "J-DU000002",
      phases: [
        [PHASE.approved, "2017-07-19T10:00:00+09:00"],
        [PHASE.expired, "2021-03-16T20:00:00+09:00"],
        [PHASE.closed, "2023-07-13T10:00:00+09:00"],
      ],
      expireDate: "2018-04-01",
      branches: [
        initial("2017-07-01T10:00:00+09:00", "2017-07-19T10:00:00+09:00"),
        closing("2023-07-12T10:00:00+09:00", "2023-07-13T10:00:00+09:00"),
      ],
    })
    expect(await periods()).toEqual({
      "J-DU000001": ["2023-04-03", "2024-05-01"],
      "J-DU000002": ["2017-07-19", "2023-07-13"],
    })
  })

  it("lists neither a project discarded after its approval, whether or not its branches were discarded with it, nor one never approved", async () => {
    const approvedAt = "2020-12-03T10:00:00+09:00"
    await upstream.usage({
      id: "J-DU000001",
      phases: [[PHASE.approved, approvedAt], [PHASE.discarded, "2021-03-15T13:39:00+09:00"]],
      expireDate: "2025-03-31",
      branches: [{
        type: INITIAL,
        statuses: [[SUBMITTED, approvedAt], [APPROVED, approvedAt], [DISCARDED, "2021-03-15T13:39:00+09:00"]],
        grants: ["JGAD000001"],
      }],
    })
    await upstream.usage({
      id: "J-DU000002",
      phases: [[PHASE.submitted, approvedAt], [PHASE.reviewing, approvedAt]],
      expireDate: "2025-03-31",
      branches: [{ type: INITIAL, statuses: [[SUBMITTED, approvedAt]], grants: ["JGAD000001"] }],
    })
    await upstream.usage({
      id: "J-DU000003",
      phases: [[PHASE.approved, approvedAt], [PHASE.discarded, "2021-03-15T13:39:00+09:00"]],
      expireDate: "2025-03-31",
      branches: [initial(approvedAt, approvedAt)],
    })
    await upstream.usage({
      id: "J-DU000004",
      phases: [[PHASE.approved, approvedAt]],
      expireDate: "2025-03-31",
      branches: [initial(approvedAt, approvedAt)],
    })
    expect(Object.keys(await periods())).toEqual(["J-DU000004"])
  })

  it("gives each research a row of its own datasets, granted by the approved branches only", async () => {
    const approvedAt = "2023-04-03T10:00:00+09:00"
    await upstream.usage({
      id: "J-DU000001",
      phases: [[PHASE.approved, approvedAt]],
      expireDate: "2027-03-31",
      branches: [
        initial(approvedAt, approvedAt, ["JGAD000001", "JGAD000004"]),
        { type: ADDITION, statuses: [[SUBMITTED, approvedAt], [APPROVED, approvedAt]], grants: ["JGAD000002"] },
        { type: ADDITION, statuses: [[SUBMITTED, approvedAt], [REJECTED, approvedAt]], grants: ["JGAD000003"] },
      ],
    })
    const rows = await fetchCauEntries(pool, FIXTURE_SCHEMA)
    expect(rows.map((row) => [row.humLabel, row.datasetAccessions])).toEqual([
      ["hum0001", ["JGAD000001", "JGAD000002"]],
      ["hum0002", ["JGAD000004"]],
    ])
  })
})
