import { describe, expect, it } from "vitest"

import {
  type Connection,
  grantStatements,
  parseConnection,
  quoteIdentifier,
  quoteLiteral,
} from "./grants.server"

describe("parseConnection", () => {
  it("reads user, password and database out of a plain connection string", () => {
    expect(parseConnection("postgres://humandbs_app:secret@db:5432/humandbs")).toEqual({
      user: "humandbs_app",
      password: "secret",
      database: "humandbs",
    })
  })

  it("percent-decodes a password containing '@', ':', '/' and '%'", () => {
    const password = "p@ss:w/rd%25"
    const encoded = encodeURIComponent(password)
    const parsed = parseConnection(`postgres://user:${encoded}@db:5432/humandbs`)
    expect(parsed.password).toBe(password)
  })

  it("percent-decodes the user", () => {
    const user = "user@name"
    const parsed = parseConnection(`postgres://${encodeURIComponent(user)}:secret@db:5432/humandbs`)
    expect(parsed.user).toBe(user)
  })

  it("percent-decodes the database name", () => {
    const database = "my db"
    const parsed = parseConnection(`postgres://user:secret@db:5432/${encodeURIComponent(database)}`)
    expect(parsed.database).toBe(database)
  })

  it("strips only the path's leading slash, not a slash percent-encoded inside the database name", () => {
    const database = "a/b"
    const parsed = parseConnection(`postgres://user:secret@db:5432/${encodeURIComponent(database)}`)
    expect(parsed.database).toBe(database)
  })

  it("accepts the postgresql:// spelling, since libpq treats it the same as postgres://", () => {
    expect(parseConnection("postgresql://user:secret@db:5432/humandbs").database).toBe("humandbs")
  })
})

describe("quoteIdentifier", () => {
  it("wraps the value in double quotes", () => {
    expect(quoteIdentifier("humandbs_app")).toBe("\"humandbs_app\"")
  })

  it("doubles a double quote inside the value rather than leaving it unescaped", () => {
    expect(quoteIdentifier("weird\"role")).toBe("\"weird\"\"role\"")
  })

  it("throws on a null byte, which Postgres cannot represent in an identifier", () => {
    expect(() => quoteIdentifier("a\0b")).toThrow()
  })
})

describe("quoteLiteral", () => {
  it("wraps the value in single quotes", () => {
    expect(quoteLiteral("secret")).toBe("'secret'")
  })

  it("doubles a single quote inside the value rather than leaving it unescaped", () => {
    expect(quoteLiteral("o'brien")).toBe("'o''brien'")
  })

  it("does not treat a backslash specially, because standard_conforming_strings is on", () => {
    expect(quoteLiteral("back\\slash")).toBe("'back\\slash'")
  })

  it("throws on a null byte, which Postgres cannot represent in a string literal", () => {
    expect(() => quoteLiteral("a\0b")).toThrow()
  })
})

const APP: Connection = { user: "humandbs_app", password: "secret", database: "humandbs" }
const OWNER: Connection = { user: "humandbs", password: "secret", database: "humandbs" }

describe("grantStatements", () => {
  it("never grants TRUNCATE to the role, on event or on any other table", () => {
    const statements = grantStatements(APP, OWNER)
    for (const statement of statements) {
      if (/\bGRANT\b/.test(statement)) {
        expect(statement).not.toMatch(/TRUNCATE/)
      }
    }
  })

  it("grants only SELECT and INSERT on event once every statement has been applied", () => {
    const statements = grantStatements(APP, OWNER)
    const broadGrant = statements.findIndex((s) => s.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES"))
    const eventRevoke = statements.findIndex((s) => s.includes("REVOKE UPDATE, DELETE, TRUNCATE ON event"))
    // The broad grant must exist and run before the revoke that narrows it back
    // down, or the revoke would have nothing to remove.
    expect(broadGrant).toBeGreaterThanOrEqual(0)
    expect(eventRevoke).toBeGreaterThan(broadGrant)
  })

  it("revokes exactly UPDATE, DELETE and TRUNCATE on event, leaving SELECT and INSERT untouched", () => {
    const statements = grantStatements(APP, OWNER)
    const eventRevoke = statements.find((s) => s.includes("ON event"))
    expect(eventRevoke).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON event/)
    expect(eventRevoke).not.toMatch(/SELECT/)
    expect(eventRevoke).not.toMatch(/INSERT/)
  })

  it("also revokes UPDATE, DELETE and TRUNCATE on replaced_dataset_content", () => {
    const statements = grantStatements(APP, OWNER)
    const revoke = statements.find((s) => s.includes("ON replaced_dataset_content"))
    expect(revoke).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON replaced_dataset_content/)
  })

  it("quotes the app user identifier consistently everywhere the role is named", () => {
    const app: Connection = { ...APP, user: "weird\"role" }
    const statements = grantStatements(app, OWNER)
    const quoted = quoteIdentifier(app.user)
    const naming = statements.filter((s) => s.includes(quoted))
    // The role is named this way in several statements; the raw, unescaped
    // user must never appear on its own, since that would open a SQL-injection
    // seam.
    expect(naming.length).toBeGreaterThan(1)
    for (const statement of statements) {
      expect(statement).not.toContain(`ROLE ${app.user} `)
    }
  })

  it("embeds the app password literal-quoted in the ALTER ROLE statement", () => {
    const app: Connection = { ...APP, password: "o'brien" }
    const statements = grantStatements(app, OWNER)
    const alter = statements.find((s) => s.startsWith("ALTER ROLE"))
    expect(alter).toContain(quoteLiteral(app.password))
  })
})
