/**
 * Links whose destination has gone, pointed at where it went or taken off.
 *
 * The table is made by hand: each dead address was looked for at its new home —
 * the same institute's new address, the archive's current search page, the
 * paper's DOI — and replaced only where the new page was confirmed to be the
 * same thing. Where nothing was found the link is taken off and its words stay.
 *
 * A link is text in two places, a span with a destination inside prose and a
 * `Link` in a list of addresses. A span keeps its words when it loses its
 * destination; a `Link` has no words apart from its address, so it leaves the
 * list. Where the words were the address itself, they follow the address.
 *
 * A publication's DOI field often holds the article's address instead of a DOI.
 * A moved address there follows the table like any other; a dead one stays, since
 * the field is the only record of which article was meant.
 */

export type Relink = { action: "replace", to: string } | { action: "unlink" }

function isRecord(node: unknown): node is Record<string, unknown> {
  return typeof node === "object" && node !== null && !Array.isArray(node)
}

function isSpan(node: unknown): node is { text: string, href: string } {
  return isRecord(node) && typeof node.text === "string" && typeof node.href === "string"
}

function isLink(node: unknown): node is { id: string, url: string, text: string } {
  return isRecord(node) && typeof node.id === "string" && typeof node.url === "string" && typeof node.text === "string"
}

/** The content with every mapped address followed, and the addresses that were. */
export function relink<T>(content: T, map: ReadonlyMap<string, Relink>): { content: T, used: Set<string> } {
  const used = new Set<string>()

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return (node as unknown[]).flatMap((item) => {
        if (isLink(item)) {
          const rule = map.get(item.url)
          if (rule === undefined) return [item]
          used.add(item.url)
          if (rule.action === "unlink") return []
          return [{ ...item, url: rule.to, text: item.text === item.url ? rule.to : item.text }]
        }
        return [walk(item)]
      })
    }
    if (isSpan(node)) {
      const rule = map.get(node.href)
      if (rule === undefined) return node
      used.add(node.href)
      if (rule.action === "unlink") return { text: node.text }
      return { text: node.text === node.href ? rule.to : node.text, href: rule.to }
    }
    if (!isRecord(node)) return node
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, key === "doi" ? followed(value) : walk(value)]))
  }

  const followed = (slot: unknown): unknown => {
    if (!isRecord(slot) || slot.state !== "value" || typeof slot.value !== "string") return slot
    const rule = map.get(slot.value)
    if (rule === undefined) return slot
    used.add(slot.value)
    return rule.action === "replace" ? { ...slot, value: rule.to } : slot
  }

  return { content: walk(content) as T, used }
}

/**
 * The hand-made table, one address per line: `url`, `action`, `new_url`,
 * `evidence`, tab-separated under a header. An address found alive is `keep`
 * and needs no rule.
 */
export function readRelinks(tsv: string): Map<string, Relink> {
  const map = new Map<string, Relink>()
  const [header, ...rows] = tsv.split("\n").filter((line) => line.trim() !== "")
  if (header?.split("\t")[0] !== "url") throw new Error("the relink table has no header")
  for (const row of rows) {
    const [url = "", action = "", to = ""] = row.split("\t")
    if (map.has(url)) throw new Error(`${url} is in the relink table twice`)
    if (action === "keep") continue
    if (action === "unlink") map.set(url, { action })
    else if (action === "replace" && /^https?:\/\//.test(to)) map.set(url, { action, to })
    else throw new Error(`${url}: cannot read action ${JSON.stringify(action)} to ${JSON.stringify(to)}`)
  }
  return map
}
