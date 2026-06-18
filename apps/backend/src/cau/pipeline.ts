import type { ResolveResult } from "./resolve"
import {
  APPROVED_STATUS,
  CURRENT_PHASES,
  ENDED_PHASES,
  isExcluded,
  normalizeEmail,
  normalizeId,
  normalizeNameTokens,
  ROLE_RANK,
  SCOPE_PHASES,
} from "./resolve"
import type {
  CanonicalPerson,
  DuPhaseInfo,
  Occurrence,
  PersonHumRollup,
  PersonJgadRollup,
  RawCore,
  RawJgad,
  RawJgadHumId,
  Role,
} from "./types"

const parseDate = (s: string | null): Date | null => {
  if (!s) return null
  const d = new Date(s.substring(0, 10))
  return Number.isNaN(d.getTime()) ? null : d
}

const minDate = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b
  if (!b) return a
  return a <= b ? a : b
}

const maxDate = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}

export interface PipelineResult {
  cauByHum: Map<string, { person: CanonicalPerson; rollup: PersonHumRollup }[]>
  persons: CanonicalPerson[]
  stats: {
    occurrences: number
    canonicalPersons: number
    inScopeDu: number
    personJgadPairs: number
    personHumPairs: number
    currentPairs: number
    endedPairs: number
    unmappedJgad: number
  }
}

export const buildDuPhaseMap = (
  raw: { dsDuId: string; phaseType: string; approvedAt: string | null; expireDate: string | null; endedDate: string | null }[],
): Map<string, DuPhaseInfo> => {
  const m = new Map<string, DuPhaseInfo>()
  for (const r of raw) {
    m.set(r.dsDuId, {
      phase: r.phaseType,
      approvedAt: parseDate(r.approvedAt),
      expireDate: parseDate(r.expireDate),
      endedDate: parseDate(r.endedDate),
    })
  }
  return m
}

export const buildJgadHumMap = (raw: RawJgadHumId[]): Map<string, string> => {
  const m = new Map<string, string>()
  for (const r of raw) {
    const existing = m.get(r.jgad)
    if (existing && existing !== r.humId) {
      console.error(`JGAD ${r.jgad} maps to multiple hum_id: ${existing}, ${r.humId}`)
    }
    m.set(r.jgad, r.humId)
  }
  return m
}

export function buildOccurrences(core: RawCore[]): Occurrence[] {
  const occs: Occurrence[] = []

  for (const c of core) {
    const displayParts = [c.piLastEn, c.piFirstEn].filter(Boolean)
    const disp = displayParts.join(" ").trim() || normalizeEmail(c.piEmail) || ""
    occs.push({
      applId: c.applId,
      role: "PI",
      accountId: normalizeId(c.piAccountId),
      email: normalizeEmail(c.piEmail),
      orcid: "",
      eradid: "",
      tokens: normalizeNameTokens(c.piLastEn, c.piFirstEn),
      institution: c.piInstEn.trim(),
      institutionLower: c.piInstEn.trim().toLowerCase(),
      enFamily: c.piLastEn.trim(),
      enGiven: c.piFirstEn.trim(),
      jaFamily: c.piLastJa.trim(),
      jaGiven: c.piFirstJa.trim(),
      displayName: disp,
      country: c.piCountryEn.trim(),
      studyTitle: c.studyTitle.trim(),
      studyTitleEn: c.studyTitleEn.trim(),
      submitDate: c.submitDate,
      jduId: c.jduId,
    })
  }

  return occs
}

export function runPipeline(
  core: RawCore[],
  jgad: RawJgad[],
  duPhase: Map<string, DuPhaseInfo>,
  jgadHumMap: Map<string, string>,
  resolved: ResolveResult,
): PipelineResult {
  const { persons, occurrencePersonId, occurrences } = resolved

  const personMap = new Map<string, CanonicalPerson>()
  for (const p of persons) personMap.set(p.personId, p)

  const applJgad = new Map<string, Set<string>>()
  for (const j of jgad) {
    if (!j.jgad.startsWith("JGAD")) continue
    const s = applJgad.get(j.applId) ?? new Set()
    s.add(j.jgad)
    applJgad.set(j.applId, s)
  }

  const applVersion = new Map<string, number>()
  for (const c of core) {
    const v = c.applVersion.replace(/^-/, "")
    applVersion.set(c.applId, /^\d+$/.test(v) ? parseInt(v) : -1)
  }

  const latestApproved = new Map<string, string>()
  for (const c of core) {
    if (c.status !== APPROVED_STATUS) continue
    const existing = latestApproved.get(c.jduId)
    if (!existing) {
      latestApproved.set(c.jduId, c.applId)
    } else {
      const ver = applVersion.get(c.applId) ?? -1
      const existingVer = applVersion.get(existing) ?? -1
      if (ver > existingVer || (ver === existingVer && c.applId > existing)) {
        latestApproved.set(c.jduId, c.applId)
      }
    }
  }

  const applPersons = new Map<string, Map<string, Role>>()
  for (let i = 0; i < occurrences.length; i++) {
    const o = occurrences[i]
    const pid = occurrencePersonId[i]
    const role = o.role
    const m = applPersons.get(o.applId) ?? new Map<string, Role>()
    const existing = m.get(pid)
    if (!existing || ROLE_RANK[role] < ROLE_RANK[existing]) {
      m.set(pid, role)
    }
    applPersons.set(o.applId, m)
  }

  const pj = new Map<string, PersonJgadRollup>()
  const unmappedJgads = new Set<string>()

  for (const c of core) {
    if (c.status !== APPROVED_STATUS) continue
    const dp = duPhase.get(c.jduId)
    if (!dp || !SCOPE_PHASES.has(dp.phase)) continue

    const isCurrentGrant =
      latestApproved.get(c.jduId) === c.applId && CURRENT_PHASES.has(dp.phase)

    const personRoles = applPersons.get(c.applId)
    if (!personRoles) continue

    const jgads = applJgad.get(c.applId)
    if (!jgads) continue

    for (const g of [...jgads].sort()) {
      if (!jgadHumMap.has(g)) {
        if (latestApproved.get(c.jduId) === c.applId) {
          unmappedJgads.add(g)
        }
        continue
      }

      for (const [pid, role] of personRoles) {
        const key = `${pid}\t${g}`
        let a = pj.get(key)
        if (!a) {
          a = { isCurrent: false, currentExpire: null, endDate: null, startDate: null, role }
          pj.set(key, a)
        }
        if (ROLE_RANK[role] < ROLE_RANK[a.role]) a.role = role
        if (dp.approvedAt) a.startDate = minDate(a.startDate, dp.approvedAt)
        if (isCurrentGrant) {
          a.isCurrent = true
          if (dp.expireDate) a.currentExpire = maxDate(a.currentExpire, dp.expireDate)
        }
        if (ENDED_PHASES.has(dp.phase) && dp.endedDate) {
          a.endDate = maxDate(a.endDate, dp.endedDate)
        }
      }
    }
  }

  const humAgg = new Map<string, PersonHumRollup>()

  for (const [key, a] of pj) {
    const [pid, g] = key.split("\t")
    const hum = jgadHumMap.get(g)!
    const humKey = `${pid}\t${hum}`

    let h = humAgg.get(humKey)
    if (!h) {
      h = { isCurrent: false, startDate: null, endDate: null, role: a.role, datasetIds: [] }
      humAgg.set(humKey, h)
    }

    if (a.isCurrent) h.isCurrent = true
    if (ROLE_RANK[a.role] < ROLE_RANK[h.role]) h.role = a.role
    h.startDate = minDate(h.startDate, a.startDate)

    const end = a.isCurrent ? a.currentExpire : a.endDate
    if (end) h.endDate = maxDate(h.endDate, end)

    if (!h.datasetIds.includes(g)) h.datasetIds.push(g)
  }

  const cauByHum = new Map<string, { person: CanonicalPerson; rollup: PersonHumRollup }[]>()
  let currentPairs = 0
  let endedPairs = 0

  for (const [key, h] of humAgg) {
    const [pid, hum] = key.split("\t")
    const person = personMap.get(pid)
    if (!person || isExcluded(person)) continue

    h.datasetIds.sort()

    const list = cauByHum.get(hum) ?? []
    list.push({ person, rollup: h })
    cauByHum.set(hum, list)

    if (h.isCurrent) currentPairs++
    else endedPairs++
  }

  for (const list of cauByHum.values()) {
    list.sort((a, b) => a.person.personId.localeCompare(b.person.personId))
  }

  return {
    cauByHum,
    persons,
    stats: {
      occurrences: occurrences.length,
      canonicalPersons: persons.length,
      inScopeDu: [...duPhase.values()].filter(d => SCOPE_PHASES.has(d.phase)).length,
      personJgadPairs: pj.size,
      personHumPairs: humAgg.size,
      currentPairs,
      endedPairs,
      unmappedJgad: unmappedJgads.size,
    },
  }
}
