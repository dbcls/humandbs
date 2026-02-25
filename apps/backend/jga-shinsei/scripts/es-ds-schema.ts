/**
 * JGA Shinsei DS (データ提供申請) - ES スキーマ定義
 *
 * `jga-shinsei-ds` インデックスのマッピングを生成する。
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

export const dsSchema = {
  // === IDs ===
  jdsId: f.keyword(),
  jsubIds: f.keyword(),
  humIds: f.keyword(),
  jgaIds: f.keyword(),

  // === 研究内容 ===
  studyTitle: f.bilingualTextKw(),
  aim: f.bilingualText(),
  method: f.bilingualText(),
  participant: f.bilingualText(),
  restriction: f.bilingualText(),
  publication: f.text(),
  icd10: f.keyword(),

  // === データ (nested) ===
  data: f.nested({
    dataAccess: f.keyword(),
    studyType: f.keyword(),
    studyTypeOther: f.text(),
    target: f.text(),
    fileFormat: f.keyword(),
    fileSize: f.keyword(),
  }),

  // === リリース日 ===
  releaseDate: f.date(),

  // === 匿名化 ===
  deIdentification: f.object({
    status: f.keyword(),
    date: f.keyword(),
    reason: f.text(),
  }),

  // === 倫理審査 ===
  review: f.object({
    submissionStatus: f.keyword(),
    submissionDate: f.keyword(),
    companyUseStatus: f.keyword(),
    multicenterCollaborativeStudyStatus: f.keyword(),
    nbdcDataProcessingStatus: f.keyword(),
    nbdcDataProcessingReason: f.text(),
    nbdcGuidelineStatus: f.keyword(),
    isSimplifiedReview: f.boolean(),
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

export const dsMapping = generateMapping(dsSchema)
