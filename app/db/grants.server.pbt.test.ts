import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  type Connection,
  grantStatements,
  parseConnection,
  quoteIdentifier,
  quoteLiteral,
} from "./grants.server"

/**
 * `parseConnection` decodes what libpq itself decodes, so the interesting
 * inputs are the ones a real password can contain: the URL's own delimiters
 * (`@`, `:`, `/`) and `%` itself, once percent-encoded.
 */
const component = fc.oneof(
  fc.string(),
  fc.string({ unit: "grapheme" }),
  fc.tuple(
    fc.constantFrom("@", ":", "/", "%", "%40", "%2F", "%3A", "%25"),
    fc.string(),
  ).map(([special, rest]) => `${special}${rest}`),
).filter((s) => !s.includes("\0"))

describe("parseConnection", () => {
  it("recovers user, password and database exactly after percent-encoding them into a URL", () => {
    fc.assert(fc.property(component, component, component, (user, password, database) => {
      const url
        = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}`
          + `@db:5432/${encodeURIComponent(database)}`
      expect(parseConnection(url)).toEqual({ user, password, database })
    }))
  })
})

/** Undoes what `quoteIdentifier` does, so the property can assert a round trip. */
function unquoteIdentifier(quoted: string): string {
  expect(quoted.startsWith("\"")).toBe(true)
  expect(quoted.endsWith("\"")).toBe(true)
  return quoted.slice(1, -1).replaceAll("\"\"", "\"")
}

/** Undoes what `quoteLiteral` does, so the property can assert a round trip. */
function unquoteLiteral(quoted: string): string {
  expect(quoted.startsWith("'")).toBe(true)
  expect(quoted.endsWith("'")).toBe(true)
  return quoted.slice(1, -1).replaceAll("''", "'")
}

const anyValue = fc.oneof(
  fc.string(),
  fc.string({ unit: "grapheme" }),
  fc.constantFrom("", "\"", "\"\"", "'", "''", "\"'\"", "a\"b\"c"),
).filter((s) => !s.includes("\0"))

describe("quoteIdentifier", () => {
  it("round-trips any value, quotes included, once unquoted and un-doubled", () => {
    fc.assert(fc.property(anyValue, (value) => {
      expect(unquoteIdentifier(quoteIdentifier(value))).toBe(value)
    }))
  })

  it("throws for every value that contains a null byte", () => {
    fc.assert(fc.property(fc.string(), fc.string(), (before, after) => {
      expect(() => quoteIdentifier(`${before}\0${after}`)).toThrow()
    }))
  })
})

describe("quoteLiteral", () => {
  it("round-trips any value, quotes included, once unquoted and un-doubled", () => {
    fc.assert(fc.property(anyValue, (value) => {
      expect(unquoteLiteral(quoteLiteral(value))).toBe(value)
    }))
  })

  it("throws for every value that contains a null byte", () => {
    fc.assert(fc.property(fc.string(), fc.string(), (before, after) => {
      expect(() => quoteLiteral(`${before}\0${after}`)).toThrow()
    }))
  })
})

const connection = fc.record({
  user: anyValue,
  password: anyValue,
  database: anyValue,
}) satisfies fc.Arbitrary<Connection>

describe("grantStatements", () => {
  it("for any connection, no statement grants TRUNCATE", () => {
    fc.assert(fc.property(connection, connection, (app, owner) => {
      for (const statement of grantStatements(app, owner)) {
        if (/\bGRANT\b/.test(statement)) {
          expect(statement).not.toMatch(/TRUNCATE/)
        }
      }
    }))
  })

  it("for any connection, the revoke on event is exactly UPDATE, DELETE, TRUNCATE", () => {
    fc.assert(fc.property(connection, connection, (app, owner) => {
      const revoke = grantStatements(app, owner).find((s) => s.includes("ON event"))
      expect(revoke).toMatch(/^REVOKE UPDATE, DELETE, TRUNCATE ON event FROM /)
    }))
  })

  it("embeds the app password quoted as a literal in ALTER ROLE, whatever the password is", () => {
    fc.assert(fc.property(connection, connection, (app, owner) => {
      const alter = grantStatements(app, owner).find((s) => s.startsWith("ALTER ROLE"))
      expect(alter).toContain(quoteLiteral(app.password))
    }))
  })
})
