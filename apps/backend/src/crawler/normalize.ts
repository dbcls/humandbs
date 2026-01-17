import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { PUBLICATION_DATASET_ID_MAP, CONTROLLED_ACCESS_USERS_DATASET_ID_MAP } from "@/crawler/const"
import { listDetailJsonFiles, readDetailJson, writeNormalizedDetailJson } from "@/crawler/io"
import { buildMolDataHeaderMapping, normalizeMolDataKey } from "@/crawler/mapping-table"
import type { LangType, CrawlArgs, ParseResult, CriteriaCanonical, NormalizedParseResult, TextValue, NormalizedMolecularData, Publication, ControlledAccessUser, Release } from "@/crawler/types"

const HUMANDBS_BASE_URL = "https://humandbs.dbcls.jp"

const normalizeKey = (v: string): string => {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"))
    .replace(/[\s-]/g, "")
}

const splitValue = (value: string): string[] => {
  return value
    .split(/[\r\n]+|[、,／/]/)
    .map(v => v.trim())
    .filter(v => v !== "")
}

const isTextValue = (v: unknown): v is TextValue => {
  return (
    typeof v === "object" &&
    v !== null &&
    "text" in v &&
    "rawHtml" in v
  )
}

function normalizeText(value: string, newlineToSpace: boolean): string
function normalizeText(value: TextValue, newlineToSpace: boolean): TextValue
function normalizeText(
  value: string | TextValue,
  newlineToSpace = true,
): string | TextValue {
  const normalizeString = (s: string): string => {
    const raw = s.trim()
    if (raw === "") return ""

    if (/^https?\s*:\s*\/\s*\//i.test(raw)) {
      return raw
    }

    let t = raw
      // Unicode 正規化（記号・全角英数・半角カナなど）
      .normalize("NFC")
      // 不可視・非改行スペース
      .replace(/[\u00A0\u200B\uFEFF]/g, " ")
      // 全角スペース
      .replace(/\u3000/g, " ")
      // 全角括弧 → 半角括弧
      .replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"))
      // 全角スラッシュ → 半角
      .replace(/／/g, "/")
      // クォート類
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, "\"")
      // ダッシュ類
      .replace(/[‐-‒–—―]/g, "-")
      // コロン前後
      .replace(/\s*[:：]\s*/g, ": ")

    if (newlineToSpace) {
      t = t.replace(/\r\n?|\n/g, " ")
    } else {
      t = t.replace(/\r\n?|\n/g, "")
    }

    // 括弧前後にスペースを入れる
    t = t
      .replace(/([^\s(])\(/g, "$1 (")
      .replace(/\)([^\s)])/g, ") $1")

    // 連続スペースを 1 個に
    return t.replace(/[ \t]{2,}/g, " ").trim()
  }

  if (typeof value === "string") {
    return normalizeString(value)
  }
  if (isTextValue(value)) {
    return {
      ...value,
      text: normalizeString(value.text),
    }
  }

  return value
}

const normalizeUrl = (url: string): string => {
  const u = url.trim()
  if (!u) return u

  if (/^https?:\/\//i.test(u)) return u

  if (u.startsWith("/")) return `${HUMANDBS_BASE_URL}${u}`

  return u
}

const normalizeSummaryFooterText = (
  text: string,
  lang: LangType,
): string => {
  if (lang === "ja") {
    return text.replace(/^※\s?/, "")
  } else {
    return text.replace(/^\*\s?/, "")
  }
}

const CRITERIA_CANONICAL_MAP: Record<string, CriteriaCanonical> = {
  // Type I
  "制限公開(typei)": "Controlled-access (Type I)",
  "controlledaccess(typei)": "Controlled-access (Type I)",

  // Type II
  "制限公開(typeii)": "Controlled-access (Type II)",
  "controlledaccess(typeii)": "Controlled-access (Type II)",

  // unrestricted
  "非制限公開": "Unrestricted-access",
  "unrestrictedaccess": "Unrestricted-access",
}

const normalizeCriteria = (
  value: string | null | undefined,
): CriteriaCanonical[] | null => {
  if (!value) return null

  const raw = value.trim()
  if (raw === "") return null

  const parts = splitValue(raw)

  const results: CriteriaCanonical[] = []

  for (const part of parts) {
    const key = normalizeKey(part)
    const canonical = CRITERIA_CANONICAL_MAP[key]
    if (canonical) {
      results.push(canonical)
    } else {
      console.debug(`[DEBUG] - Unknown criteria value: "${part}" (normalized: "${key}")`)
    }
  }

  return results.length > 0 ? results : null
}

const fixDatasetId = (
  value: string,
): string[] => {
  const raw = value.trim()
  if (raw === "") return []

  let trimmed = raw
    // ( と ) を除去
    .replace(/[()]/g, "")
    // "データ追加" と "Data addition" を除去
    .replace(/データ追加/g, "")
    .replace(/データ削除/g, "")
    .replace(/に/g, "")
    .replace(/追加/g, "")
    .replace(/Data addition/gi, "")
    .replace(/Dataset addition/gi, "")
    .replace(/data added/gi, "")
    .replace(/data deleted/gi, "")
    // , と "、" をスペースに置換
    .replace(/[、,]/g, " ")
    // 連続スペースを1つに
    .replace(/\s{2,}/g, " ")
    .trim()

  if (trimmed === "AP023461-AP024084") {
    trimmed = "PRJDB10452"
  }
  if (trimmed === "35 Dieases" || trimmed === "35 Diseases") {
    return ["35 Diseases"]
  }

  // スペースを区切り文字として分割
  return trimmed.split(" ")
}

const fixReleaseDate = (
  value: string | null | undefined,
): string[] | null => {
  if (!value) return null

  const raw = value.trim()
  if (!raw) return null
  if (raw === "Coming soon") return null
  if (raw === "近日公開予定") return null

  const dates = raw
    .split(/\s+/)
    .map(v => {
      const m = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
      if (!m) return null

      const [, y, mo, d] = m
      const mm = mo.padStart(2, "0")
      const dd = d.padStart(2, "0")

      return `${y}-${mm}-${dd}`
    })
    .filter((v): v is string => v !== null)

  return dates.length > 0 ? dates : null
}

const fixDate = (value: string): string => {
  const raw = value.trim()
  const m = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return raw

  const [, y, mo, d] = m
  const mm = mo.padStart(2, "0")
  const dd = d.padStart(2, "0")
  return `${y}-${mm}-${dd}`
}

const fixDateInReleases = (
  releases: Release[],
): Release[] => {
  return releases.map(rel => ({
    ...rel,
    releaseDate: fixDate(rel.releaseDate),
  }))
}

const mergeValue = (
  existing: TextValue | TextValue[] | null | undefined,
  incoming: TextValue | TextValue[] | null,
): TextValue | TextValue[] | null => {
  if (!incoming) {
    return existing ?? null
  }

  if (!existing) {
    return incoming
  }

  const toArray = (v: TextValue | TextValue[]): TextValue[] =>
    Array.isArray(v) ? v : [v]

  const merged = [
    ...toArray(existing),
    ...toArray(incoming),
  ]

  return merged.length === 1 ? merged[0] : merged
}

const normalizeMolData = (
  data: NormalizedMolecularData["data"],
  humVersionId: string,
  lang: LangType,
): NormalizedMolecularData["data"] => {
  const UNUSED_KEY = "不要な項目のため削除する"
  const SPLIT_KEYS: Record<string, string[]> = {
    "Japanese Genotype-phenotype Archive Dataset AccessionとSequence Read Archive Accessionに分ける": [
      "Japanese Genotype-phenotype Archive Dataset Accession",
      "Sequence Read Archive Accession",
    ],
    "NBDC Dataset AccessionとJapanese Genotype-phenotype Archive Dataset Accessionに分ける": [
      "NBDC Dataset Accession",
      "Japanese Genotype-phenotype Archive Dataset Accession",
    ],
  }

  const mappingTable = buildMolDataHeaderMapping()
  const normalizedData: NormalizedMolecularData["data"] = {}

  for (const [key, val] of Object.entries(data)) {
    const trimmedKey = key
      // 改行をスペースに
      .replace(/\r\n?|\n/g, " ")
      // 前後の * や ※ を除去（連続もOK）
      .replace(/^[\s*※]+|[\s*※]+$/g, "")
      // 連続スペースを1つに
      .replace(/\s{2,}/g, " ")
      .trim()
    const normKey = normalizeMolDataKey(trimmedKey, lang, mappingTable)

    if (normKey === UNUSED_KEY) {
      continue
    }

    if (!normKey) {
      console.warn(`Molecular data header "${trimmedKey}" not found in mapping table, in ${humVersionId}`)
      normalizedData[trimmedKey] = val
      continue
    }

    if (normKey in SPLIT_KEYS) {
      const splitKeys = SPLIT_KEYS[normKey]

      for (const sk of splitKeys) {
        normalizedData[sk] = mergeValue(
          normalizedData[sk],
          val,
        )
      }
      continue
    }

    normalizedData[normKey] = mergeValue(
      normalizedData[normKey],
      val,
    )
  }

  return normalizedData
}

const fixPeriodOfDataUseInControlledAccessUsers = (
  cas: ControlledAccessUser[],
): ControlledAccessUser[] => {
  return cas.map(ca => {
    if (!ca.periodOfDataUse) return ca

    const raw = ca.periodOfDataUse.trim()
    if (raw === "") return { ...ca, periodOfDataUse: null }

    const m = raw.match(/^(.+?)\s*-\s*(.+)$/)
    if (!m) return ca

    const [, start, end] = m
    if (start && end) {
      const fixedStart = fixDate(start)
      const fixedEnd = fixDate(end)
      return {
        ...ca,
        periodOfDataUse: `${fixedStart}-${fixedEnd}`,
      }
    }
    return ca
  })
}

const normalizeDoiValue = (doi: string | null): string | null => {
  if (!doi) return null

  if (["doi:", "In submission", "null", "投稿中"].includes(doi)) {
    return null
  }

  return doi
}

const removeUnusedPublications = (
  publications: Publication[],
): Publication[] => {
  const UNUSED_TITLES = [
    "In submission",
    "under publishing",
    "投稿中",
    "投稿準備中",
  ]

  return publications.filter(pub => {
    if (!pub.title) return true

    const t = pub.title.trim()
    return !UNUSED_TITLES.includes(t)
  })
}

const fixDatasetIdsInPublications = (
  publications: Publication[],
): Publication[] => {
  return publications.map(pub => {
    const mappedIds: string[] = []

    for (const id of pub.datasetIds) {
      if (id in PUBLICATION_DATASET_ID_MAP) {
        mappedIds.push(...PUBLICATION_DATASET_ID_MAP[id])
      } else {
        mappedIds.push(id)
      }
    }

    return {
      ...pub,
      datasetIds: mappedIds,
    }
  })
}

const fixDatasetIdsInControlledAccessUsers = (
  cas: ControlledAccessUser[],
): ControlledAccessUser[] => {
  return cas.map(ca => {
    const mappedIds: string[] = []

    for (const id of ca.datasetIds) {
      if (id in CONTROLLED_ACCESS_USERS_DATASET_ID_MAP) {
        mappedIds.push(...CONTROLLED_ACCESS_USERS_DATASET_ID_MAP[id])
      } else {
        mappedIds.push(id)
      }
    }

    return {
      ...ca,
      datasetIds: mappedIds,
    }
  })
}

const fixGrantId = (value: string | null): string[] | null => {
  if (!value) return null
  if (["None", "null", "なし"].includes(value)) return null

  const fixedValue = value
    // 全角英数字を半角に
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xFEE0),
    )
    // 全角ハイフン・ダッシュ類を半角 -
    .replace(/[－―ー–—]/g, "-")
    // 全角スペース → 半角
    .replace(/\u3000/g, " ")
    // スペース整理
    .replace(/\s{2,}/g, " ")
    .trim()

  if (!fixedValue) return null

  const jpMatches = fixedValue.match(/JP/g)
  if (jpMatches && jpMatches.length > 1) {
    return fixedValue
      .split(/(?=JP)/g)
      .map(v => v.trim())
      .filter(v => v !== "")
  }

  return [fixedValue]
}

const parsePeriodOfDataUse = (
  value: string,
): { startDate: string | null; endDate: string | null } | null => {
  const raw = value.trim().replace(/\s+/g, "")
  if (raw === "") return null

  const m = raw.match(/^(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/)
  if (!m) return null

  const [, startDate, endDate] = m
  console.log({ startDate, endDate })
  return {
    startDate,
    endDate,
  }
}

/* =========================
* main
* ========================= */

const parseArgs = (): CrawlArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", { alias: "i", type: "string" })
    .option("lang", { choices: ["ja", "en"] as const })
    .option("concurrency", { type: "number", default: 4 })
    .parseSync()

const normalizeOneDetail = (
  humVersionId: string,
  lang: LangType,
): void => {
  const detail = readDetailJson(humVersionId, lang) as ParseResult | null
  if (!detail) return

  const normalizedDetail: NormalizedParseResult = {
    ...detail,
    summary: {
      ...detail.summary,
      aims: normalizeText(detail.summary.aims, lang === "en"),
      methods: normalizeText(detail.summary.methods, lang === "en"),
      targets: normalizeText(detail.summary.targets, lang === "en"),
      url: detail.summary.url.map(u => ({
        ...u,
        url: normalizeUrl(u.url),
      })),
      datasets: detail.summary.datasets.map(ds => ({
        ...ds,
        datasetId: ds.datasetId ? fixDatasetId(normalizeText(ds.datasetId, true)) : null,
        typeOfData: ds.typeOfData ? normalizeText(ds.typeOfData, true) : null,
        criteria: normalizeCriteria(ds.criteria),
        releaseDate: ds.releaseDate ? fixReleaseDate(normalizeText(ds.releaseDate, true)) : null,
      })),
      footers: detail.summary.footers.map(f => ({
        ...f,
        text: normalizeSummaryFooterText(normalizeText(f.text, lang === "en"), lang),
      })),
    },
    molecularData: detail.molecularData.map(md => ({
      ...md,
      id: normalizeText(md.id, true),
      data: Object.fromEntries(
        Object.entries(md.data).map(([key, val]) => [
          key,
          val === null ? null : normalizeText(val, true),
        ]),
      ),
      footers: md.footers.map(f => ({
        ...f,
        text: normalizeText(f.text, true),
      })),
    })),
    dataProvider: {
      ...detail.dataProvider,
      principalInvestigator: detail.dataProvider.principalInvestigator.map(pi => normalizeText(pi, true)),
      affiliation: detail.dataProvider.affiliation.map(af => normalizeText(af, true)),
      projectName: detail.dataProvider.projectName.map(pn => normalizeText(pn, true)),
      projectUrl: detail.dataProvider.projectUrl.map(u => ({
        ...u,
        url: normalizeUrl(u.url),
      })),
      grants: detail.dataProvider.grants.map(grant => ({
        grantName: grant.grantName ? normalizeText(grant.grantName, true) : null,
        projectTitle: grant.projectTitle ? normalizeText(grant.projectTitle, true) : null,
        grantId: grant.grantId ? fixGrantId(normalizeText(grant.grantId, true)) : null,
      })),
    },
    publications: detail.publications.map(pub => ({
      ...pub,
      title: pub.title ? normalizeText(pub.title, true) : null,
      doi: pub.doi ? normalizeDoiValue(normalizeText(pub.doi, true)) : null,
      datasetIds: pub.datasetIds.map(id => normalizeText(id, true)),
    })),
    controlledAccessUsers: detail.controlledAccessUsers.map(cau => ({
      ...cau,
      principalInvestigator: cau.principalInvestigator ? normalizeText(cau.principalInvestigator, true) : null,
      affiliation: cau.affiliation ? normalizeText(cau.affiliation, true) : null,
      country: cau.country ? normalizeText(cau.country, true) : null,
      researchTitle: cau.researchTitle ? normalizeText(cau.researchTitle, true) : null,
      datasetIds: cau.datasetIds.map(id => normalizeText(id, true)),
      periodOfDataUse: cau.periodOfDataUse ? parsePeriodOfDataUse(normalizeText(cau.periodOfDataUse, true)) : null,
    })),
    releases: detail.releases.map(rel => ({
      ...rel,
      content: normalizeText(rel.content, lang === "en"),
      releaseNote: normalizeText(rel.releaseNote, true),
    })),
  }

  normalizedDetail.publications = removeUnusedPublications(normalizedDetail.publications)
  normalizedDetail.publications = fixDatasetIdsInPublications(normalizedDetail.publications)
  normalizedDetail.controlledAccessUsers = fixDatasetIdsInControlledAccessUsers(normalizedDetail.controlledAccessUsers)
  normalizedDetail.controlledAccessUsers = fixPeriodOfDataUseInControlledAccessUsers(normalizedDetail.controlledAccessUsers)
  normalizedDetail.releases = fixDateInReleases(normalizedDetail.releases)
  for (const molData of normalizedDetail.molecularData) {
    molData.data = normalizeMolData(molData.data, humVersionId, lang)
  }

  writeNormalizedDetailJson(humVersionId, lang, normalizedDetail)
}

const main = async (): Promise<void> => {
  const args = parseArgs()
  const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]

  const targets = listDetailJsonFiles({
    humId: args.humId,
    langs,
  })

  const tasks: (() => Promise<void>)[] = targets.map(
    ({ humVersionId, lang }) =>
      async () => {
        try {
          normalizeOneDetail(humVersionId, lang)
        } catch (e) {
          console.error(
            `Normalize failed: ${humVersionId} (${lang}): ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      },
  )

  const conc = Math.max(1, Math.min(32, args.concurrency ?? 4))
  for (let i = 0; i < tasks.length; i += conc) {
    await Promise.all(tasks.slice(i, i + conc).map(fn => fn()))
  }
}

if (require.main === module) {
  await main()
}
