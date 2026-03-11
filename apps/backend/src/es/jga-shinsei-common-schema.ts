/**
 * JGA Shinsei - ES 共通サブスキーマ
 *
 * DS / DU 両方のマッピングで共有するフィールド定義。
 * `src/es/generate-mapping.ts` の `f` ヘルパーを再利用する。
 */
import { f } from "./generate-mapping"

// === 住所 ===

export const addressFields = f.object({
  country: f.keyword(),
  postalCode: f.noindex(),
  prefecture: f.keyword(),
  city: f.noindex(),
  street: f.noindex(),
})

// === 機関長 (個人情報 -> 全 noindex) ===

export const headFields = f.object({
  name: f.noindex(),
  job: f.noindex(),
  phone: f.noindex(),
  email: f.noindex(),
})

// === PI (研究責任者) ===

export const piFields = f.object({
  accountId: f.keyword(),
  firstName: f.bilingualText(),
  middleName: f.bilingualText(),
  lastName: f.bilingualText(),
  institution: f.bilingualTextKw(),
  division: f.bilingualText(),
  job: f.bilingualText(),
  phone: f.noindex(),
  email: f.noindex(),
  address: addressFields,
})

// === 申請提出者 (PI と同構造) ===

export const submitterFields = f.object({
  accountId: f.keyword(),
  firstName: f.bilingualText(),
  middleName: f.bilingualText(),
  lastName: f.bilingualText(),
  institution: f.bilingualTextKw(),
  division: f.bilingualText(),
  job: f.bilingualText(),
  phone: f.noindex(),
  email: f.noindex(),
  address: addressFields,
})

// === 研究分担者 (nested) ===

export const collaboratorFields = f.nested({
  name: f.text(),
  division: f.text(),
  job: f.text(),
  eradid: f.keyword(),
  orcid: f.keyword(),
  seminar: f.keyword(),
})

// === アップロード済みファイル (nested) ===

export const uploadedFileFields = f.nested({
  file: f.keyword(),
  type: f.keyword(),
})

// === ステータス履歴 (nested) ===

export const statusHistoryFields = f.nested({
  status: f.integer(),
  statusLabel: f.bilingualKeyword(),
  date: f.date("strict_date_optional_time"),
})
