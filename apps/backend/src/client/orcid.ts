import { readFileSync } from "fs"
import { z } from "zod"

import type { Person, Research } from "@/types"

// const ORCID_CLIENT_ID = "APP-EXAMPLE1234567890"
// const ORCID_CLIENT_SECRET = "f3f6f6e5-1f4c-4f4d-8b1e-8b3e5f6e7d8c"
const ORCID_CLIENT_ID = "APP-WK96KZBLQBBJ0KKK"
const ORCID_CLIENT_SECRET = "e06e1b7b-45a3-4fa7-9f02-f8ed376abedf"

export const TokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  scope: z.string(),
}).loose()
export type TokenResponse = z.infer<typeof TokenResponseSchema>

export const getOrcidToken = async (
  params: {
    clientId: string
    clientSecret: string
  },
): Promise<TokenResponse> => {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "client_credentials",
    scope: "/read-public",
  })

  const res = await fetch("https://orcid.org/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  })

  if (!res.ok) {
    throw new Error(`Failed to get ORCID token: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return TokenResponseSchema.parse(data)
}

const buildQuery = (name: string): string => {
  const n = name.trim()
  if (!n) {
    throw new Error("Cannot search ORCID without a name")
  }

  const parts = n.split(/\s+/)
  if (parts.length >= 2) {
    const given = parts[0]
    const family = parts.slice(1).join(" ")
    return `(text:"${n}" OR (given-names:"${given}" AND family-name:"${family}"))`
  }

  return `(text:"${n}" OR given-names:"${n}" OR family-name:"${n}")`
}

export const OrcidResponseSchema = z.object({
  "num-found": z.number(),
  result: z.array(
    z.object({
      "orcid-identifier": z.object({
        uri: z.string(),
        path: z.string(),
        host: z.string(),
      }).loose(),
    }).loose(),
  ).optional().nullable(),
}).loose()
export type OrcidResponse = z.infer<typeof OrcidResponseSchema>

export const searchOrcidByPerson = async (
  person: Person,
  token: string,
): Promise<OrcidResponse> => {
  const url = new URL("https://pub.orcid.org/v3.0/search/")
  url.searchParams.append("q", buildQuery(person.name))

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.orcid+json",
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to search ORCID: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return OrcidResponseSchema.parse(data)
}

export const getOrcidRecord = async (
  orcidId: string,
  token: string,
): Promise<any> => {
  const url = `https://pub.orcid.org/v3.0/${encodeURIComponent(orcidId)}/record`

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.orcid+json",
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to get ORCID record: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return data
}

if (require.main === module) {
  const ES_JSON_PATH = "/app/apps/backend/crawler-results/es-json/research.json"
  const text = readFileSync(ES_JSON_PATH, "utf-8")
  const data: Research[] = JSON.parse(text)
  const persons: Person[] = []
  for (let i = 0; i < 10; i++) (
    persons.push(...data[i].dataProvider)
  )

  const token = await getOrcidToken({
    clientId: ORCID_CLIENT_ID,
    clientSecret: ORCID_CLIENT_SECRET,
  })

  for (const person of persons) {
    console.log(`Searching ORCID for ${person.name}...`)
    const result = await searchOrcidByPerson(person, token.access_token)
    console.log(JSON.stringify(result, null, 2))
    for (const item of result.result ?? []) {
      const orcidId = item["orcid-identifier"].path
      console.log(`Fetching ORCID record for ${orcidId}...`)
      const record = await getOrcidRecord(orcidId, token.access_token)
      console.log(JSON.stringify(record, null, 2))
    }
  }
}
