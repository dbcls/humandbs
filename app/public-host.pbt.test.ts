import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { runPublicHost } from "./_public-host-script"

/**
 * **The script never writes a host other than the application's.** It may
 * refuse a URL the application accepts — nginx then does not start, which is
 * seen at once — but a host that differs would refuse every write and every
 * signed URL, and be found only then.
 */

// A label beginning `xn--` is punycode, which the URL parser decodes and may
// reject; the script does not decode it, so such a name is outside what it
// can be held to.
const dnsName = fc.mixedCase(fc.domain()).filter((name) => !/(?:^|\.)xn--/i.test(name))

const port = fc.option(
  fc.tuple(fc.nat({ max: 3 }), fc.integer({ min: 0, max: 65535 }))
    .map(([zeros, value]) => `:${"0".repeat(zeros)}${String(value)}`),
  { nil: "" },
)

const tail = fc.tuple(
  fc.webPath(),
  fc.option(fc.webQueryParameters().map((query) => `?${query}`), { nil: "" }),
  fc.option(fc.webFragments().map((fragment) => `#${fragment}`), { nil: "" }),
).map((parts) => parts.join(""))

const accepted = fc.tuple(
  fc.mixedCase(fc.constantFrom("http", "https")),
  fc.oneof(dnsName, fc.ipV4()),
  port,
  tail,
).map(([scheme, host, portPart, rest]) => `${scheme}://${host}${portPart}${rest}`)

const urlLike = fc.oneof(
  fc.webUrl({
    validSchemes: ["http", "https", "ftp"],
    authoritySettings: { withIPv4: true, withIPv4Extended: true, withIPv6: true, withPort: true, withUserInfo: true },
    withQueryParameters: true,
    withFragments: true,
  }),
  fc.tuple(
    fc.mixedCase(fc.constantFrom("http://", "https://", "https:", "https:/", "https:///")),
    fc.string({ unit: fc.constantFrom("a", "Z", "0", "9", ".", "-", ":", "@", "[", "]", "/", "?", "#", "%", "\\", " ", "\t", "\"", "'", ";", "x") }),
  ).map((parts) => parts.join("")),
  fc.string().filter((value) => !value.includes("\0")),
)

function applicationHost(uri: string): string | null {
  try {
    const url = new URL(uri)
    return url.protocol === "http:" || url.protocol === "https:" ? url.host : null
  } catch {
    return null
  }
}

describe("docker/nginx/public-host.sh", () => {
  it("writes the application's host for a DNS name or an IPv4 address with any port and path", () => {
    fc.assert(fc.property(accepted, (uri) => {
      expect(runPublicHost(uri)).toMatchObject({ refused: false, host: applicationHost(uri) })
    }))
  })

  it("either refuses a value or writes the application's host", () => {
    fc.assert(fc.property(urlLike, (uri) => {
      const outcome = runPublicHost(uri)
      if (!outcome.refused) expect(outcome.host).toBe(applicationHost(uri))
    }))
  })

  it("writes nothing an nginx string or directive could be ended by", () => {
    fc.assert(fc.property(fc.oneof(accepted, urlLike), (uri) => {
      const outcome = runPublicHost(uri)
      if (!outcome.refused) expect(outcome.host).toMatch(/^[a-z0-9.:-]+$/)
    }))
  })
})
