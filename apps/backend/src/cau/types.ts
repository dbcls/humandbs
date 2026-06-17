export interface RawCore {
  jduId: string
  applId: string
  applVersion: string
  status: string
  submitDate: string
  accountGroup: string
  piAccountId: string
  piEmail: string
  piLastEn: string
  piFirstEn: string
  piLastJa: string
  piFirstJa: string
  piInstEn: string
}

export interface RawPerson {
  applId: string
  role: "member" | "collaborator"
  idx: number
  accountId: string
  email: string
  orcid: string
  eradid: string
  lastEn: string
  firstEn: string
  institution: string
  nameFull: string
}

export interface RawJgad {
  applId: string
  jgad: string
}

export interface RawDuPhase {
  dsDuId: string
  phaseType: string
  approvedAt: string | null
  expireDate: string | null
  endedDate: string | null
}

export interface RawJgadHumId {
  jgad: string
  humId: string
}

export type Role = "PI" | "member" | "collaborator"

export interface Occurrence {
  applId: string
  role: Role
  accountId: string
  email: string
  orcid: string
  eradid: string
  tokens: string[]
  institution: string
  institutionLower: string
  enFamily: string
  enGiven: string
  jaFamily: string
  jaGiven: string
  displayName: string
  submitDate: string
  jduId: string
}

export interface CanonicalPerson {
  personId: string
  enFamily: string
  enGiven: string
  jaFamily: string
  jaGiven: string
  displayName: string
  canonicalEmail: string
  affiliation: string
  orcid: string
  allEmails: string[]
  allAccounts: string[]
  role: Role
  flag: string
}

export interface DuPhaseInfo {
  phase: string
  approvedAt: Date | null
  expireDate: Date | null
  endedDate: Date | null
}

export interface PersonJgadRollup {
  isCurrent: boolean
  currentExpire: Date | null
  endDate: Date | null
  startDate: Date | null
  role: Role
}

export interface PersonHumRollup {
  isCurrent: boolean
  startDate: Date | null
  endDate: Date | null
  role: Role
  datasetIds: string[]
}
