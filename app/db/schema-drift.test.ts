import { describe, expect, it } from "vitest"

import { ungeneratedMigrations } from "../../scripts/schema-drift"

describe("drizzle/", () => {
  it("holds a migration for everything app/db/schema/ reports, so no schema edit is left out of the databases", () => {
    expect(ungeneratedMigrations()).toEqual([])
  })
})
