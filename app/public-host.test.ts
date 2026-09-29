import { describe, expect, it } from "vitest"

import { runPublicHost } from "./_public-host-script"

/**
 * The host the proxy hands to the application and the object store. It has to
 * be the host the application signs URLs for and compares a form's `Origin`
 * with, which is `new URL(HUMANDBS_AUTH_REDIRECT_URI).host`.
 */
describe("docker/nginx/public-host.sh", () => {
  it.each([
    ["https://example.org/auth/callback", "example.org"],
    ["http://localhost:8080/auth/callback", "localhost:8080"],
    ["https://example.org", "example.org"],
    ["https://example.org?next=/", "example.org"],
    ["https://example.org#top", "example.org"],
    ["HTTPS://Sub.Example.ORG/auth/callback", "sub.example.org"],
    ["https://example.org:443/auth/callback", "example.org"],
    ["http://example.org:80/auth/callback", "example.org"],
    ["https://example.org:80/auth/callback", "example.org:80"],
    ["http://example.org:443/auth/callback", "example.org:443"],
    ["https://example.org:0443/auth/callback", "example.org"],
    ["http://127.0.0.1:08080/auth/callback", "127.0.0.1:8080"],
    ["http://localhost:0/auth/callback", "localhost:0"],
    ["http://localhost:65535/auth/callback", "localhost:65535"],
    ["https://1.2.3.example/auth/callback", "1.2.3.example"],
  ])("writes the host of %s as the application reads it", (uri, expected) => {
    expect(new URL(uri).host).toBe(expected)
    expect(runPublicHost(uri)).toMatchObject({ refused: false, host: expected })
  })

  it("writes a map that nginx reads at the level of http", () => {
    expect(runPublicHost("https://example.org/auth/callback")).toMatchObject({
      refused: false,
      conf: "map $host $public_host {\n  default \"example.org\";\n}\n",
    })
  })

  it.each([
    ["no value at all", undefined],
    ["an empty value", ""],
    ["a value of whitespace", "   "],
    ["a host with no scheme", "example.org/auth/callback"],
    ["a scheme that is neither http nor https", "ftp://example.org/auth/callback"],
    ["a special scheme written without slashes", "https:example.org/auth/callback"],
    ["an empty host", "https:///auth/callback"],
    ["credentials before the host", "https://user:secret@example.org/auth/callback"],
    ["an IPv6 address", "https://[::1]:8080/auth/callback"],
    ["an IPv4 address the URL parser rewrites", "https://1.2.3/auth/callback"],
    ["an IPv4 address in hexadecimal", "https://0x7f.0.0.1/auth/callback"],
    ["an IPv4 address with a leading zero", "https://01.2.3.4/auth/callback"],
    ["an IPv4 address out of range", "https://256.0.0.1/auth/callback"],
    ["a name whose last label is a number", "https://example.123/auth/callback"],
    ["a percent-encoded host", "https://%65xample.org/auth/callback"],
    ["a backslash the URL parser reads as a slash", "https://example.org\\auth/callback"],
    ["a quote that would end the nginx string", "https://exa\"mple.org/auth/callback"],
    ["a semicolon that would end the nginx directive", "https://example.org;/auth/callback"],
    ["an empty port", "https://example.org:/auth/callback"],
    ["a port above 65535", "https://example.org:65536/auth/callback"],
    ["a port too long to be a number", "https://example.org:99999999999999999999/auth/callback"],
    ["a space inside the host", "https://exa mple.org/auth/callback"],
    ["a trailing newline", "https://example.org/auth/callback\n"],
    ["a tab the URL parser would drop", "https://exam\tple.org/auth/callback"],
  ])("refuses %s rather than guess at a host", (_, uri) => {
    const outcome = runPublicHost(uri)
    expect(outcome.refused).toBe(true)
    if (outcome.refused) expect(outcome.message).toMatch(/HUMANDBS_AUTH_REDIRECT_URI/)
  })
})
