/**
 * What the upstream systems answer, and the catalog a seeded draft is written
 * against.
 *
 * The catalog is a fixture rather than a generator: the laws are about the
 * relationship between what upstream says and what a fixed vocabulary holds, so
 * generating the vocabulary too would only make the two drift past each other
 * and leave every law vacuously true.
 *
 * The strings upstream states are drawn from a pool that half matches that
 * vocabulary. Drawn freely they would never match, and the half of the law that
 * says a known word is written would never be exercised.
 */

import fc from "fast-check"

import type { DsBranchDetail, JgadRegistration } from "~/upstream/application-db.server"
import type { DraSubmission } from "~/upstream/dra.server"

import type { CatalogWithTerms } from "../queries.server"

export const ACCESS_KEY = "key-access"
export const TYPE_KEY = "key-type"
export const DISEASE_KEY = "key-disease"
export const METHOD_KEY = "key-method"
export const PLATFORM_KEY = "key-platform"
export const READ_TYPE_KEY = "key-read-type"
export const READ_LENGTH_KEY = "key-read-length"

const ACCESS_SET = "set-access"
const DISEASE_SET = "set-disease"
const METHOD_SET = "set-method"
const PLATFORM_SET = "set-platform"
const READ_TYPE_SET = "set-read-type"

function key(seed: {
  id: string
  code: string
  scope: "dataset" | "experiment"
  valueType: "text" | "vocabulary" | "number"
  setId?: string
  multiple?: boolean
  unit?: string
}) {
  return {
    id: seed.id,
    code: seed.code,
    scope: seed.scope,
    valueType: seed.valueType,
    labelJa: seed.code,
    labelEn: seed.code,
    position: 0,
    vocabularySetId: seed.setId ?? null,
    multiple: seed.multiple ?? false,
    canonicalUnit: seed.unit ?? null,
    inputUnits: seed.unit === undefined ? null : [seed.unit],
  }
}

function term(setId: string, code: string, labelEn: string) {
  return { id: `${setId}/${code}`, setId, code, labelJa: null, labelEn, position: 0 }
}

/** The keys and terms a seeded draft may write under. */
export const catalogFixture: CatalogWithTerms = {
  keys: [
    key({ id: ACCESS_KEY, code: "access-criteria", scope: "dataset", valueType: "vocabulary", setId: ACCESS_SET }),
    key({ id: TYPE_KEY, code: "type-of-data", scope: "dataset", valueType: "text" }),
    key({ id: DISEASE_KEY, code: "disease-icd10", scope: "experiment", valueType: "vocabulary", setId: DISEASE_SET, multiple: true }),
    key({ id: METHOD_KEY, code: "experimental-method", scope: "experiment", valueType: "vocabulary", setId: METHOD_SET, multiple: true }),
    key({ id: PLATFORM_KEY, code: "platform", scope: "experiment", valueType: "vocabulary", setId: PLATFORM_SET, multiple: true }),
    key({ id: READ_TYPE_KEY, code: "read-type", scope: "experiment", valueType: "vocabulary", setId: READ_TYPE_SET }),
    key({ id: READ_LENGTH_KEY, code: "read-length", scope: "experiment", valueType: "number", unit: "bp" }),
  ],
  terms: [
    term(ACCESS_SET, "unrestricted-access", "Unrestricted-access"),
    term(ACCESS_SET, "controlled-access-type-1", "Controlled-access (Type I)"),
    term(ACCESS_SET, "controlled-access-type-2", "Controlled-access (Type II)"),
    term(DISEASE_SET, "C34", "Malignant neoplasm of bronchus and lung"),
    term(DISEASE_SET, "C349", "Bronchus or lung, unspecified"),
    term(DISEASE_SET, "E110", "Type 2 diabetes mellitus with coma"),
    term(METHOD_SET, "wgs", "WGS"),
    term(METHOD_SET, "rna-seq", "RNA-seq"),
    term(PLATFORM_SET, "illumina-hiseq-2500", "Illumina HiSeq 2500"),
    term(READ_TYPE_SET, "paired-end", "Paired-end"),
    term(READ_TYPE_SET, "single-end", "Single-end"),
  ],
}

/** Half of these name a term of the fixture; the rest name nothing. */
const STRATEGIES = ["WGS", "RNA-Seq", "WXS", "AMPLICON", ""]
const MODELS = ["Illumina HiSeq 2500", "DNBSEQ-T7", "Illumina NovaSeq 6000"]
const DISEASES = ["C34.9", "C34", "E11.0", "-", "dummy", "Z999", "c349"]

const wording = fc.oneof(fc.constant(""), fc.string({ maxLength: 40 }))

export const dsBranchArb: fc.Arbitrary<DsBranchDetail> = fc.record({
  applicationId: fc.constant("J-DS000001-001"),
  humLabel: fc.oneof(fc.constant(null), fc.constant("hum0001")),
  approvedOn: fc.constant("2024-05-18"),
  titleJa: wording,
  titleEn: wording,
  piNameJa: wording,
  piNameEn: wording,
  accessions: fc.constant([]),
  aimsJa: wording,
  aimsEn: wording,
  methodsJa: wording,
  methodsEn: wording,
  targetsJa: wording,
  targetsEn: wording,
  affiliationJa: wording,
  affiliationEn: wording,
  country: wording,
  // Every value the column takes, including the two that say nothing about one
  // dataset: an application covering both access types, and one not yet set.
  dataAccess: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 4 })),
  // The separators the box is actually written with, both widths of comma.
  icd10: fc.tuple(
    fc.array(fc.constantFrom(...DISEASES), { maxLength: 4 }),
    fc.constantFrom(", ", "、", " ", "; "),
  ).map(([codes, separator]) => codes.join(separator)),
})

export const jgadRegistrationArb: fc.Arbitrary<JgadRegistration> = fc.record({
  accession: fc.constant("JGAD000001"),
  title: wording,
  datasetType: fc.oneof(fc.constant(""), fc.constantFrom(...STRATEGIES)),
})

export const draSubmissionArb: fc.Arbitrary<DraSubmission> = fc.record({
  accession: fc.constant("DRA000001"),
  title: wording,
  groups: fc.array(
    fc.record({
      strategy: fc.constantFrom(...STRATEGIES),
      instrumentModels: fc.uniqueArray(fc.constantFrom(...MODELS), { maxLength: 3 }),
      layout: fc.oneof(fc.constant(null), fc.constantFrom("PAIRED", "SINGLE")),
      readLength: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 300 })),
    }),
    { maxLength: 4 },
  ).map((groups) => groups.filter(
    (group, at) => groups.findIndex((other) => other.strategy === group.strategy) === at,
  )),
  unreachable: fc.constant([]),
})
