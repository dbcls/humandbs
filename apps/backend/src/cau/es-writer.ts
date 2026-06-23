import { esClient, ES_INDEX } from "@/api/es-client/client"
import type { Person } from "@/crawler/types/structured"

import type { CanonicalPerson, PersonHumRollup } from "./types"

const CJK_RE = /[぀-ゟ゠-ヿ㐀-䶿一-鿿]/

export const isCjk = (s: string): boolean => CJK_RE.test(s)

const formatDate = (d: Date | null): string | null =>
  d ? d.toISOString().split("T")[0] : null

const tv = (text: string | null) =>
  text ? { text, rawHtml: null } : null

export const toPersonDoc = (
  personHum: PersonHumRollup,
  person: CanonicalPerson,
): Person => {
  let enText: string | null = null
  let jaText: string | null = null

  if (person.enFamily || person.enGiven) {
    enText = [person.enFamily, person.enGiven].filter(Boolean).join(" ")
  } else if (person.displayName && !isCjk(person.displayName)) {
    enText = person.displayName
  }

  if (person.jaFamily || person.jaGiven) {
    jaText = [person.jaFamily, person.jaGiven].filter(Boolean).join("")
  } else if (person.displayName && isCjk(person.displayName)) {
    jaText = person.displayName
  }

  if (!enText && !jaText) {
    enText = person.displayName || null
    jaText = enText
  } else if (!jaText) {
    jaText = enText
  } else if (!enText) {
    enText = jaText
  }

  return {
    name: { ja: tv(jaText), en: tv(enText) },
    email: person.canonicalEmail || null,
    orcid: person.orcid || null,
    organization: person.affiliation
      ? {
          name: { ja: tv(person.affiliation), en: tv(person.affiliation) },
          address: person.country ? { country: person.country } : null,
        }
      : null,
    datasetIds: personHum.datasetIds,
    researchTitle: (person.studyTitle || person.studyTitleEn)
      ? { ja: person.studyTitle || null, en: person.studyTitleEn || null }
      : undefined,
    periodOfDataUse: {
      startDate: formatDate(personHum.startDate),
      endDate: formatDate(personHum.endDate),
    },
  }
}

export const clearAllCau = async (): Promise<number> => {
  const result = await esClient.updateByQuery({
    index: ES_INDEX.research,
    body: {
      script: {
        source: "ctx._source.controlledAccessUser = []",
        lang: "painless",
      },
      query: { match_all: {} },
    },
    refresh: true,
    conflicts: "proceed",
  })
  return result.updated ?? 0
}

export const updateCauForHum = async (
  humId: string,
  persons: Person[],
): Promise<boolean> => {
  try {
    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      body: { doc: { controlledAccessUser: persons } },
      refresh: false,
    })
    return true
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "meta" in error &&
      (error as { meta?: { statusCode?: number } }).meta?.statusCode === 404
    ) {
      return false
    }
    throw error
  }
}

export const updateAllCau = async (
  cauByHum: Map<string, Person[]>,
): Promise<{ cleared: number; updated: number; notFound: number }> => {
  const cleared = await clearAllCau()

  let updated = 0
  let notFound = 0
  for (const [humId, persons] of cauByHum) {
    const found = await updateCauForHum(humId, persons)
    if (found) {
      updated++
    } else {
      notFound++
    }
  }

  await esClient.indices.refresh({ index: ES_INDEX.research })

  return { cleared, updated, notFound }
}
