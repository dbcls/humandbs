import type { CanonicalPerson, Occurrence, Role } from "./types"

export const CURRENT_PHASES = new Set(["160", "210"])
export const ENDED_PHASES = new Set(["190", "200", "220"])
export const SCOPE_PHASES = new Set([...CURRENT_PHASES, ...ENDED_PHASES])
export const APPROVED_STATUS = "60"

export const EXCLUDE_EMAILS = new Set([
  "humandbs+agent@dbcls.jp",
  "humhisec@biosciencedbc.jp",
  "sakhliza2@gmail.com",
])
const EXCLUDE_NAME_TOKENS_SET = new Set(["nbdc\0secretariat"])
const KNOWN_SAME_PERSON_EMAILS = new Set(["aleko@dlut.edu.cn"])

export const ROLE_RANK: Record<Role, number> = { PI: 0, member: 1, collaborator: 2 }

export const normalizeEmail = (s: string): string => {
  const v = (s ?? "").trim().toLowerCase()
  return v.includes("@") ? v : ""
}

export const normalizeId = (s: string): string => (s ?? "").trim()

const clean = (s: string): string => (s ?? "").split(/\s+/).filter(Boolean).join(" ")

export const normalizeNameTokens = (...parts: string[]): string[] => {
  const toks: string[] = []
  for (const p of parts) {
    if (!p) continue
    const normalized = p
      .normalize("NFKC")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .normalize("NFC")
    const replaced = normalized.replace(/[,.;]/g, " ")
    for (const t of replaced.toLowerCase().split(/\s+/)) {
      if (t) toks.push(t)
    }
  }
  return [...new Set(toks)].sort()
}

const tokensKey = (tokens: string[]): string => tokens.join("\0")

export const samePerson = (a: string[], b: string[]): boolean => {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size === 0 || sb.size === 0) return true
  if ([...sa].every((t) => sb.has(t)) || [...sb].every((t) => sa.has(t))) return true

  const initials = (short: string[], long: string[]): boolean =>
    short.every(
      (t) => t.length <= 2 && [...long].some((l) => l.startsWith(t[0])),
    )
  return initials(a, b) || initials(b, a)
}

const nameCompatible = (
  namesA: Set<string>,
  namesB: Set<string>,
): boolean => {
  if (namesA.size === 0 || namesB.size === 0) return true
  for (const ka of namesA) {
    const ta = ka.split("\0")
    for (const kb of namesB) {
      const tb = kb.split("\0")
      const setA = new Set(ta)
      if (tb.some((t) => setA.has(t))) return true
      if (samePerson(ta, tb)) return true
    }
  }
  return false
}

class UnionFind {
  private parent: number[]
  private accounts: Set<string>[]
  private orcids: Set<string>[]
  private nameTokenSets: Set<string>[]

  constructor(
    private occurrences: Occurrence[],
  ) {
    const n = occurrences.length
    this.parent = Array.from({ length: n }, (_, i) => i)
    this.accounts = occurrences.map((o) =>
      o.accountId ? new Set([o.accountId]) : new Set(),
    )
    this.orcids = occurrences.map((o) =>
      o.orcid ? new Set([o.orcid]) : new Set(),
    )
    this.nameTokenSets = occurrences.map((o) =>
      o.tokens.length > 0 ? new Set([tokensKey(o.tokens)]) : new Set(),
    )
  }

  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]
      x = this.parent[x]
    }
    return x
  }

  union(a: number, b: number, nameGuard = false): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    if (nameGuard && !nameCompatible(this.nameTokenSets[ra], this.nameTokenSets[rb])) return
    this.parent[rb] = ra
    for (const v of this.accounts[rb]) this.accounts[ra].add(v)
    for (const v of this.orcids[rb]) this.orcids[ra].add(v)
    for (const v of this.nameTokenSets[rb]) this.nameTokenSets[ra].add(v)
  }

  unionBy(
    keyFn: (o: Occurrence) => string | null,
    nameGuard = false,
  ): void {
    const groups = new Map<string, number[]>()
    for (let i = 0; i < this.occurrences.length; i++) {
      const k = keyFn(this.occurrences[i])
      if (!k) continue
      const g = groups.get(k)
      if (g) g.push(i)
      else groups.set(k, [i])
    }
    for (const idxs of groups.values()) {
      for (let j = 1; j < idxs.length; j++) {
        this.union(idxs[0], idxs[j], nameGuard)
      }
    }
  }

  clusters(): Map<number, number[]> {
    const result = new Map<number, number[]>()
    for (let i = 0; i < this.occurrences.length; i++) {
      const root = this.find(i)
      const c = result.get(root)
      if (c) c.push(i)
      else result.set(root, [i])
    }
    return result
  }
}

const clusterSignature = (idxs: number[], occs: Occurrence[]): string => {
  const sigs: string[] = []
  for (const i of idxs) {
    const o = occs[i]
    sigs.push(
      o.orcid ||
        o.accountId ||
        o.email ||
        `${o.tokens.join("|")}@${o.institutionLower}`,
    )
  }
  return sigs.sort()[0]
}

const clusterNameConflict = (idxs: number[], occs: Occurrence[]): boolean => {
  const tks = idxs
    .map((i) => occs[i].tokens)
    .filter((t) => t.length > 0)
  let hasConflict = false
  for (let x = 0; x < tks.length && !hasConflict; x++) {
    for (let y = x + 1; y < tks.length && !hasConflict; y++) {
      const sx = new Set(tks[x])
      if (tks[y].every((t) => !sx.has(t)) && !samePerson(tks[x], tks[y])) {
        hasConflict = true
      }
    }
  }
  if (!hasConflict) return false

  const emails = new Set(idxs.map((i) => occs[i].email).filter(Boolean))
  if ([...emails].some((e) => KNOWN_SAME_PERSON_EMAILS.has(e))) return false

  const orcids = new Set(idxs.map((i) => occs[i].orcid).filter(Boolean))
  const eradids = new Set(idxs.map((i) => occs[i].eradid).filter(Boolean))
  return orcids.size !== 1 && eradids.size !== 1
}

export interface ResolveResult {
  persons: CanonicalPerson[]
  occurrencePersonId: string[]
  occurrences: Occurrence[]
}

export const resolvePersons = (occurrences: Occurrence[]): ResolveResult => {
  if (occurrences.length === 0)
    return { persons: [], occurrencePersonId: [], occurrences }

  const uf = new UnionFind(occurrences)

  uf.unionBy((o) => o.orcid || null)
  uf.unionBy((o) => o.eradid || null)
  uf.unionBy((o) => o.email || null)
  uf.unionBy((o) =>
    o.tokens.length > 0 && o.institutionLower
      ? JSON.stringify([tokensKey(o.tokens), o.institutionLower])
      : null,
  )
  uf.unionBy((o) => o.accountId || null, true)

  const clusters = uf.clusters()

  const ordered = [...clusters.values()].sort(
    (a, b) =>
      clusterSignature(a, occurrences) < clusterSignature(b, occurrences)
        ? -1
        : 1,
  )

  type OccField = keyof Occurrence
  const latest = (idxs: number[], field: OccField): string => {
    const cand = idxs.filter(
      (i) => ((occurrences[i][field] as string) ?? "").trim() !== "",
    )
    if (cand.length === 0) return ""
    const best = cand.reduce((a, b) =>
      occurrences[a].submitDate >= occurrences[b].submitDate ? a : b,
    )
    return clean(occurrences[best][field] as string)
  }

  const occPid: string[] = Array.from({ length: occurrences.length }, () => "")

  const persons = ordered.map((idxs, n) => {
    const pid = `P${String(n + 1).padStart(5, "0")}`
    for (const i of idxs) occPid[i] = pid
    const role = idxs.reduce<Role>((best, i) => {
      const r = occurrences[i].role
      return ROLE_RANK[r] < ROLE_RANK[best] ? r : best
    }, "collaborator")

    let disp = latest(idxs, "displayName")
    const email = latest(idxs, "email")
    if (!disp) {
      const accounts = [
        ...new Set(
          idxs.map((i) => occurrences[i].accountId).filter(Boolean),
        ),
      ].sort()
      disp = email || accounts[0] || pid
    }

    const allEmails = [
      ...new Set(idxs.map((i) => occurrences[i].email).filter(Boolean)),
    ].sort()
    const allAccounts = [
      ...new Set(idxs.map((i) => occurrences[i].accountId).filter(Boolean)),
    ].sort()
    const allOrcid = [
      ...new Set(idxs.map((i) => occurrences[i].orcid).filter(Boolean)),
    ].sort()
    const flag = clusterNameConflict(idxs, occurrences) ? "name-conflict" : ""

    return {
      personId: pid,
      enFamily: latest(idxs, "enFamily"),
      enGiven: latest(idxs, "enGiven"),
      jaFamily: latest(idxs, "jaFamily"),
      jaGiven: latest(idxs, "jaGiven"),
      displayName: disp,
      canonicalEmail: email,
      affiliation: latest(idxs, "institution"),
      country: latest(idxs, "country"),
      studyTitle: latest(idxs, "studyTitle"),
      studyTitleEn: latest(idxs, "studyTitleEn"),
      orcid: allOrcid[0] ?? "",
      allEmails,
      allAccounts,
      role,
      flag,
    }
  })

  return { persons, occurrencePersonId: occPid, occurrences }
}

export const isExcluded = (person: CanonicalPerson): boolean => {
  if (person.allEmails.some((e) => EXCLUDE_EMAILS.has(e))) return true
  const tokens = normalizeNameTokens(person.displayName)
  if (tokens.length > 0 && EXCLUDE_NAME_TOKENS_SET.has(tokensKey(tokens)))
    return true
  return false
}
