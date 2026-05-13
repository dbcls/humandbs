# JGA 申請データ変換後スキーマ

EAV (Entity-Attribute-Value) パターンの `components` 配列を API フレンドリーな構造に変換した後のスキーマ。

型定義の SSOT は [`src/crawler/types/jga-shinsei.ts`](../../src/crawler/types/jga-shinsei.ts)。本ドキュメントは「型から読み取れない変換規約・ドメイン知識」だけをまとめる。

## ステータスコードと日英ラベルの対応

`StatusHistoryEntry.status` (整数) は以下の値を取り、`statusLabel` で日英ラベルに展開される。

| コード | ja | en |
|--------|----|----|
| 10 | 申請書類作成中 | Preparing |
| 20 | 申請完了 | Submitted |
| 30 | 申請者へ差し戻し中 | Revision requested |
| 40 | 審査中 | DAC reviewing |
| 50 | 申請却下 | Rejected |
| 60 | 申請承認 | Approved |
| 70 | 申請取り下げ | Canceled |
| 80 | 利用期間終了 | Closed |

## 変換ルール

### 命名規則

- snake_case → camelCase: `data_access` → `dataAccess`
- prefix グループはネスト化: `pi_first_name` → `pi.firstName`

### BilingualText マージ

`_en` サフィックスのキーペアを 1 つの `{ ja: string | null, en: string | null }` オブジェクトにまとめる。

| 元キー (ja) | 元キー (en) | 出力フィールド |
|-------------|-------------|----------------|
| `aim` | `aim_en` | `aim` |
| `method` | `method_en` | `method` |
| `participant` | `participant_en` | `participant` |
| `restriction` | `restriction_en` | `restriction` |
| `submission_study_title` | `submission_study_title_en` | `studyTitle` (J-DS) |
| `use_study_title` | `use_study_title_en` | `studyTitle` (J-DU) |
| `pi_first_name` | `pi_first_name_en` | `pi.firstName` |
| `pi_last_name` | `pi_last_name_en` | `pi.lastName` |
| (なし) | `pi_middle_name_en` | `pi.middleName` (ja は常に null) |

#### ja が常に null になる BilingualText

以下のフィールドは component key に日本語版が存在しないため、`{ ja: null, en: string | null }` の形になる。

- `pi.middleName`、`submitter.middleName`、`submitter.institution`、`submitter.division`
- J-DU の `members[].firstName / middleName / lastName / institution / division / job`

### multiValue グループ紐付け

同じ prefix の multiValue キーを出現順 (index) で紐付けてオブジェクト配列化する。

| グループ | 入力キー | 出力フィールド |
|----------|----------|----------------|
| data (J-DS) | `data_access`, `study_type`, `study_type_other`, `target`, `file_format`, `file_size` | `data: DataEntry[]` |
| collaborators | `collaborator_name`, `_division`, `_job`, `_eradid`, `_orcid`, `_seminar` | `collaborators: Collaborator[]` |
| members (J-DU) | `member_account_id`, `_first_name_en`, `_middle_name_en`, `_last_name_en`, `_email`, `_institution_en`, `_division_en`, `_job_en`, `_eradid`, `_orcid` | `members: Member[]` |
| useDatasets (J-DU) | `use_dataset_request`, `_purpose`, `_id` | `useDatasets: UseDataset[]` |
| uploadedFiles | `uploaded_file`, `uploaded_file_type` | `uploadedFiles: UploadedFile[]` |

### Boolean 変換

`is_*` prefix のフィールドは boolean に変換する。

| 元値 | 変換後 |
|------|--------|
| `"TRUE"`, `"true"`, `"ok"` | `true` |
| `"FALSE"`, `"false"` | `false` |
| 未設定 / null | `null` |

### トップレベルフィールド

- `create_date` → `createDate`
- `submit_date` → `submitDate`
- `status_history` → `statusHistory` (上表のステータスラベル付与)

## 変換前後の例

### 変換前 (EAV)

```json
{
  "jds_id": "J-DS002495",
  "application": { "create_date": "2024-12-03T..." },
  "components": [
    { "key": "aim", "value": "ゲノム解析による..." },
    { "key": "aim_en", "value": "Genomic analysis..." },
    { "key": "pi_first_name", "value": "太郎" },
    { "key": "pi_first_name_en", "value": "Taro" },
    { "key": "collaborator_name", "value": "Alice" },
    { "key": "collaborator_name", "value": "Bob" }
  ],
  "status_history": [{ "status": 10, "date": "2024-12-03T..." }],
  "submit_date": "2024-12-03T..."
}
```

### 変換後 (API フレンドリー)

```json
{
  "jdsId": "J-DS002495",
  "aim": { "ja": "ゲノム解析による...", "en": "Genomic analysis..." },
  "pi": {
    "firstName": { "ja": "太郎", "en": "Taro" },
    "institution": { "ja": "○○大学", "en": "XX University" }
  },
  "collaborators": [
    { "name": "Alice", "division": "..." },
    { "name": "Bob", "division": "..." }
  ],
  "statusHistory": [
    { "status": 10, "statusLabel": { "ja": "申請書類作成中", "en": "Preparing" }, "date": "..." }
  ],
  "createDate": "2024-12-03T..."
}
```
