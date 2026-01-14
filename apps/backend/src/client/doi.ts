import { readFileSync } from "fs"
import { z } from "zod"

import type { Publication, Research } from "@/types"

const CROSSREF = "https://api.crossref.org/works"

const YearPartsSchema = z.object({
  "date-parts": z.array(z.array(z.number().nullable())).optional(),
}).loose()

const CrossrefItemSchema = z.object({
  DOI: z.string(),
  title: z.array(z.string()).default([]),
  author: z.array(z.object({
    given: z.string().optional(),
    family: z.string().optional(),
  })).optional(),
  "container-title": z.array(z.string()).optional(),
  issued: YearPartsSchema.optional(),
  "published-online": YearPartsSchema.optional(),
  "published-print": YearPartsSchema.optional(),
  created: z.object({ "date-time": z.string().optional() }).optional(),
}).loose()
type CrossrefItem = z.infer<typeof CrossrefItemSchema>

const normTitle = (s: string): string => {
  return s.toLowerCase()
    .replace(/[:;,.\-–—(){}\[\]"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const tokenSetRatio = (a: string, b: string): number => {
  const A = new Set(normTitle(a).split(" "))
  const B = new Set(normTitle(b).split(" "))
  if (A.size === 0 || B.size === 0) return 0
  const inter = [...A].filter(t => B.has(t)).length
  const union = new Set([...A, ...B]).size
  return inter / union
}

const buildQueryTitleParams = (title: string): string => {
  return title
    .trim()
    .replace(/[.]+$/u, "")
    .replace(/\s+/g, "+")
}

const pickYear = (w: CrossrefItem): number | undefined => {
  const pickFromDateParts = (yp?: { ["date-parts"]?: ((number | null)[])[] }) => {
    const dp = yp?.["date-parts"]
    const y = (dp && dp[0] && dp[0][0] != null) ? dp[0][0] : undefined
    return typeof y === "number" ? y : undefined
  }
  return (
    pickFromDateParts(w.issued) ??
    pickFromDateParts(w["published-online"]) ??
    pickFromDateParts(w["published-print"]) ??
    (w.created?.["date-time"] ? Number(w.created["date-time"]!.slice(0, 4)) : undefined)
  )
}

export const DoiHitSchema = z.object({
  doi: z.string(),
  title: z.string().nullable().optional(),
  journal: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  score: z.number(),
})
export type DoiHit = z.infer<typeof DoiHitSchema>

export const searchDoiByTitle = async (
  title: string,
): Promise<DoiHit> => {
  const hits: DoiHit[] = []

  // 完全一致
  const url = new URL(CROSSREF)
  // url.search = `query.title=${buildQueryTitleParams(title)}&rows=5&sort=score${filterParam}`
  url.search = `query.title=${buildQueryTitleParams(title)}&rows=5&sort=score`
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  })
  if (res.ok) {
    const data = await res.json()
    const items: unknown[] = data?.message?.items ?? []
    for (const it of items) {
      const w = CrossrefItemSchema.parse(it)
      const t0 = w.title?.[0]
      hits.push({
        doi: w.DOI,
        title: t0,
        journal: w["container-title"]?.[0],
        year: pickYear(w),
        score: t0 ? tokenSetRatio(title, t0) : 0,
      })
    }
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .filter(h => h.score >= 0.4)
}

if (require.main === module) {
  const ES_JSON_PATH = "/app/apps/backend/crawler-results/es-json/research.json"
  const text = readFileSync(ES_JSON_PATH, "utf-8")
  const data: Research[] = JSON.parse(text)
  const publications: Publication[] = []
  for (let i = 0; i < 10; i++) (
    publications.push(...data[i].relatedPublication)
  )

  for (const pub of publications) {
    if (pub.doi) continue
    console.log(`Searching DOI for publication: ${pub.title} ...`)
    const results = await searchDoiByTitle(pub.title)
    console.log(JSON.stringify(results, null, 2))
  }
}
