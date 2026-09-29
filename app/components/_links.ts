/**
 * The links in rendered markup, for tests that check where a screen lets a
 * crawler go.
 */

/** Every `<a>`: the address it goes to, and the words of its `rel`. */
export function linksIn(html: string): { href: string, rel: string[] }[] {
  return [...html.matchAll(/<a\b([^>]*)>/g)].map((match) => {
    const attributes = match[1] ?? ""
    const href = /\shref="([^"]*)"/.exec(attributes)?.[1] ?? ""
    const rel = /\srel="([^"]*)"/.exec(attributes)?.[1] ?? ""
    return { href: href.replaceAll("&amp;", "&"), rel: rel.split(" ").filter((word) => word !== "") }
  })
}
