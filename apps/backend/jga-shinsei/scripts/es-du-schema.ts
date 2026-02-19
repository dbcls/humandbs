/**
 * JGA Shinsei DU (データ利用申請) - ES スキーマ定義
 *
 * `jga-shinsei-du` インデックスのマッピングを生成する。
 */
import { f, generateMapping } from "../../src/es/generate-mapping"

import {
  collaboratorFields,
  headFields,
  piFields,
  statusHistoryFields,
  submitterFields,
  uploadedFileFields,
} from "./es-common-schema"

export const duSchema = {
  // === IDs ===
  jduId: f.keyword(),
  jgadIds: f.keyword(),
  jgasIds: f.keyword(),
  humIds: f.keyword(),

  // === 研究内容 ===
  studyTitle: f.bilingualTextKw(),
  usePurpose: f.text(),
  useSummary: f.text(),
  usePublication: f.text(),

  // === 利用データセット (nested) ===
  useDatasets: f.nested({
    request: f.keyword(),
    purpose: f.text(),
    id: f.keyword(),
  }),

  // === 利用期間 ===
  usePeriod: f.object({
    start: f.date(),
    end: f.date(),
  }),

  // === 倫理審査 (DU) ===
  useReview: f.object({
    status: f.keyword(),
    date: f.keyword(),
  }),

  // === データ解析サーバー ===
  server: f.object({
    status: f.keyword(),
    offPremiseStatus: f.keyword(),
    isOffPremiseStatement: f.boolean(),
    acknowledgmentStatus: f.keyword(),
  }),

  // === SSH 公開鍵 (格納のみ) ===
  publicKey: f.disabled(),

  // === 利用報告 ===
  report: f.object({
    summary: f.text(),
    publication: f.text(),
    intellectualProperty: f.text(),
    nbdcSharingGuidelineStatus: f.keyword(),
    nbdcSharingGuidelineDetail: f.text(),
    newReportStatus: f.text(),
  }),

  // === データ削除報告 ===
  deletion: f.object({
    date: f.keyword(),
    keepSecondaryDataStatus: f.keyword(),
    keepSecondaryDataDetail: f.text(),
  }),

  // === 加工データ配布 ===
  distribution: f.object({
    status: f.keyword(),
    detail: f.text(),
    way: f.text(),
    isStatement1: f.boolean(),
    isStatement2: f.boolean(),
  }),

  // === メンバー (nested) ===
  members: f.nested({
    accountId: f.keyword(),
    firstName: f.bilingualText(),
    middleName: f.bilingualText(),
    lastName: f.bilingualText(),
    email: f.noindex(),
    institution: f.bilingualText(),
    division: f.bilingualText(),
    job: f.bilingualText(),
    eradid: f.keyword(),
    orcid: f.keyword(),
  }),

  // === 人物 ===
  head: headFields,
  pi: piFields,
  submitter: submitterFields,
  collaborators: collaboratorFields,
  uploadedFiles: uploadedFileFields,

  // === 制御情報 (格納のみ) ===
  control: f.disabled(),

  // === ステータス / 日付 ===
  statusHistory: statusHistoryFields,
  submitDate: f.date("strict_date_optional_time"),
  createDate: f.date("strict_date_optional_time"),
}

export const duMapping = generateMapping(duSchema)
