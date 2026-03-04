# JGA 申請システム DB Insert API 仕様書

## 1. 概要

### 目的

transformed JSON (`DsApplicationTransformed` / `DuApplicationTransformed`) を受け取り、EAV (Entity-Attribute-Value) パターンに逆変換して JGA 申請 DB (PostgreSQL, `ts_jgasys` スキーマ) に新規申請レコードを作成する REST API。

### データフロー

```
+----------+     +----------+     +-----------+     +------------------+
| External | --> | REST API | --> | Reverse   | --> | PostgreSQL       |
| System   |     | Endpoint |     | Transform |     | ts_jgasys schema |
+----------+     +----------+     +-----------+     +------------------+
                   POST /api/       Transformed       nbdc_application
                   jga-shinsei/     JSON -> EAV        + _component
                   {ds,du}          components         + _submit
                                                       + _status_history
```

### SSOT (Single Source of Truth)

| 対象 | ファイル |
|------|----------|
| 型定義 | [`scripts/types.ts`](../scripts/types.ts) |
| 正方向変換ロジック | [`scripts/transform.ts`](../scripts/transform.ts) |
| 変換後スキーマ | [`docs/output-schema.md`](./output-schema.md) |
| DB テーブル構造 | [`docs/database-schema.md`](./database-schema.md) |

## 2. API エンドポイント設計

### `POST /api/jga-shinsei/ds`

J-DS (データ提供申請) の新規作成。

- リクエストボディ: `DsApplicationTransformed`
- Content-Type: `application/json`

### `POST /api/jga-shinsei/du`

J-DU (データ利用申請) の新規作成。

- リクエストボディ: `DuApplicationTransformed`
- Content-Type: `application/json`

### レスポンス

#### 成功 (201 Created)

```json
{
  "applId": 12345,
  "applSubmitId": 67890,
  "dsDuId": "J-DS002495",
  "componentCount": 42
}
```

| フィールド | 型 | 説明 |
|------------|------|------|
| applId | number | 採番された `nbdc_application.appl_id` |
| applSubmitId | number | 採番された `nbdc_application_submit.appl_submit_id` |
| dsDuId | string | リクエストの J-DS/J-DU ID |
| componentCount | number | 挿入した `nbdc_application_component` の行数 |

#### エラー (400 Bad Request)

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Required field 'control.groupId' is missing",
  "details": [
    { "field": "control.groupId", "reason": "required" }
  ]
}
```

#### エラー (409 Conflict)

```json
{
  "error": "DUPLICATE_APPLICATION",
  "message": "Application J-DS002495 already exists",
  "existingApplId": 12345
}
```

#### エラー (500 Internal Server Error)

```json
{
  "error": "INSERT_FAILED",
  "message": "Transaction rolled back: ..."
}
```

## 3. 逆変換ルール

本セクションは仕様書の中核。`transform.ts` の各 builder 関数を逆方向にトレースし、transformed JSON のフィールドから `nbdc_application_component` の `(key, value)` ペアへのマッピングを定義する。

### 3.1 全体方針

| 変換パターン | 正方向 (transform) | 逆方向 (reverse) |
|-------------|-------------------|-----------------|
| 命名規則 | snake_case -> camelCase | camelCase -> snake_case |
| BilingualText | `key` + `key_en` -> `{ ja, en }` | `{ ja, en }` -> `key` (ja) + `key_en` (en) |
| ネスト | prefix + `_field` -> `prefix.field` | `prefix.field` -> `prefix_field` |
| 配列 (multiValue) | 同一 key 複数行 -> 配列 index | 配列 index -> 同一 key 複数行 |
| Boolean | `"TRUE"` / `"ok"` -> `true` | `true` -> `"TRUE"`, `false` -> `"FALSE"` |
| null | key 未存在 -> `null` | `null` -> 行を生成しない (skip) |

### 3.2 逆変換の基本ルール

#### 単値フィールド

transformed JSON の値が `null` でない場合、`nbdc_application_component` に 1 行挿入する。`null` の場合は行を生成しない。

```
{ key: "<component_key>", value: "<field_value>" }
```

#### BilingualText フィールド

`.ja` と `.en` をそれぞれ別の component key にマッピングする。いずれも `null` の場合はその行を生成しない。

```
{ ja: "日本語", en: "English" }
  -> { key: "<base_key>", value: "日本語" }
  +  { key: "<base_key>_en", value: "English" }
```

#### Boolean フィールド

```
true  -> { key: "<key>", value: "TRUE" }
false -> { key: "<key>", value: "FALSE" }
null  -> (行を生成しない)
```

> **注意**: 正方向変換では `"ok"` も `true` に変換される (`toBooleanOrNull` 参照)。逆変換では一律 `"TRUE"` を使用するため、元値が `"ok"` だった場合は復元できない（非可逆）。

#### multiValue グループ

配列の各要素について、index 順に同一 key で複数行を挿入する。`t_order` は配列の index に基づいて連番を割り当てる。

```
data[0].dataAccess = "submission_open"
data[1].dataAccess = "submission_type1"
  -> { key: "data_access", value: "submission_open",  t_order: 0 }
  +  { key: "data_access", value: "submission_type1", t_order: 1 }
```

### 3.3 J-DS 逆変換マッピング表

#### 単値フィールド

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `studyTitle.ja` | `submission_study_title` | string | BilingualText.ja |
| `studyTitle.en` | `submission_study_title_en` | string | BilingualText.en |
| `aim.ja` | `aim` | string | BilingualText.ja |
| `aim.en` | `aim_en` | string | BilingualText.en |
| `method.ja` | `method` | string | BilingualText.ja |
| `method.en` | `method_en` | string | BilingualText.en |
| `participant.ja` | `participant` | string | BilingualText.ja |
| `participant.en` | `participant_en` | string | BilingualText.en |
| `restriction.ja` | `restriction` | string | BilingualText.ja |
| `restriction.en` | `restriction_en` | string | BilingualText.en |
| `publication` | `submission_publication` | string | |
| `icd10` | `icd10` | string | |
| `releaseDate` | `release_date` | string | |

#### deIdentification

| transformed フィールド | component key | 型 |
|------------------------|---------------|------|
| `deIdentification.status` | `de_identification_status` | string |
| `deIdentification.date` | `de_identification_date` | string |
| `deIdentification.reason` | `de_identification_reason` | string |

#### review

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `review.submissionStatus` | `submission_review_status` | string | |
| `review.submissionDate` | `submission_review_date` | string | |
| `review.companyUseStatus` | `company_use_status` | string | |
| `review.multicenterCollaborativeStudyStatus` | `multicenter_collaborative_study_status` | string | union: `"yes"` / `"no"` / `"piinstitution"` |
| `review.nbdcDataProcessingStatus` | `nbdc_data_processing_status` | string | |
| `review.nbdcDataProcessingReason` | `nbdc_data_processing_reason` | string | |
| `review.nbdcGuidelineStatus` | `nbdc_guideline_status` | string | YesNo |
| `review.isSimplifiedReview` | `is_simplified_review` | boolean | `true` -> `"TRUE"`, `false` -> `"FALSE"` |

#### head

| transformed フィールド | component key | 型 |
|------------------------|---------------|------|
| `head.name` | `head_name` | string |
| `head.job` | `head_job` | string |
| `head.phone` | `head_phone` | string |
| `head.email` | `head_email` | string |

#### pi

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `pi.accountId` | `pi_account_id` | string | |
| `pi.firstName.ja` | `pi_first_name` | string | |
| `pi.firstName.en` | `pi_first_name_en` | string | |
| `pi.middleName.en` | `pi_middle_name_en` | string | ja は常に null (skip) |
| `pi.lastName.ja` | `pi_last_name` | string | |
| `pi.lastName.en` | `pi_last_name_en` | string | |
| `pi.institution.ja` | `pi_institution` | string | |
| `pi.institution.en` | `pi_institution_en` | string | |
| `pi.division.ja` | `pi_division` | string | |
| `pi.division.en` | `pi_division_en` | string | |
| `pi.job.ja` | `pi_job` | string | |
| `pi.job.en` | `pi_job_en` | string | |
| `pi.phone` | `pi_phone` | string | |
| `pi.email` | `pi_email` | string | |
| `pi.address.country` | `pi_country_en` | string | |
| `pi.address.postalCode` | `pi_postal_code_en` | string | |
| `pi.address.prefecture` | `pi_prefecture_en` | string | |
| `pi.address.city` | `pi_city_en` | string | |
| `pi.address.street` | `pi_street_en` | string | |

#### submitter

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `submitter.accountId` | `submitter_account_id` | string | |
| `submitter.firstName.ja` | `submitter_first_name` | string | |
| `submitter.firstName.en` | `submitter_first_name_en` | string | |
| `submitter.middleName.en` | `submitter_middle_name_en` | string | ja は常に null (skip) |
| `submitter.lastName.ja` | `submitter_last_name` | string | |
| `submitter.lastName.en` | `submitter_last_name_en` | string | |
| `submitter.institution.en` | `submitter_institution_en` | string | ja は常に null (skip) |
| `submitter.division.en` | `submitter_division_en` | string | ja は常に null (skip) |
| `submitter.job.ja` | `submitter_job` | string | |
| `submitter.job.en` | `submitter_job_en` | string | |
| `submitter.phone` | `submitter_phone` | string | |
| `submitter.email` | `submitter_email` | string | |
| `submitter.address.country` | `submitter_country_en` | string | |
| `submitter.address.postalCode` | `submitter_postal_code_en` | string | |
| `submitter.address.prefecture` | `submitter_prefecture_en` | string | |
| `submitter.address.city` | `submitter_city_en` | string | |
| `submitter.address.street` | `submitter_street_en` | string | |

#### control

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `control.lang` | `lang` | string | Lang union |
| `control.groupId` | `group_id` | string | |
| `control.isNoneCollaborator` | `is_none_collaborator` | boolean | `true` -> `"TRUE"` |
| `control.privateComment` | `private_comment` | string | |
| `control.isDeclareStatement` | `is_declare_statement` | boolean | `true` -> `"TRUE"` |
| `control.isAgreeMailUse` | `is_agree_mail_use` | boolean | `true` -> `"TRUE"` |

#### multiValue: data[]

配列の各要素を index 順に同一 key で複数行として挿入する。

| transformed フィールド | component key | 型 |
|------------------------|---------------|------|
| `data[i].dataAccess` | `data_access` | string (DataAccess) |
| `data[i].studyType` | `study_type` | string |
| `data[i].studyTypeOther` | `study_type_other` | string |
| `data[i].target` | `target` | string |
| `data[i].fileFormat` | `file_format` | string |
| `data[i].fileSize` | `file_size` | string |

#### multiValue: collaborators[]

| transformed フィールド | component key | 型 |
|------------------------|---------------|------|
| `collaborators[i].name` | `collaborator_name` | string |
| `collaborators[i].division` | `collaborator_division` | string |
| `collaborators[i].job` | `collaborator_job` | string |
| `collaborators[i].eradid` | `collaborator_eradid` | string |
| `collaborators[i].orcid` | `collaborator_orcid` | string |
| `collaborators[i].seminar` | `collaborator_seminar` | string (YesNo) |

#### multiValue: uploadedFiles[]

| transformed フィールド | component key | 型 |
|------------------------|---------------|------|
| `uploadedFiles[i].file` | `uploaded_file` | string |
| `uploadedFiles[i].type` | `uploaded_file_type` | string |

### 3.4 J-DU 固有フィールド逆変換表

J-DU は共通フィールド (head, pi, submitter, collaborators, uploadedFiles, control) に加え、以下の固有フィールドを持つ。共通フィールドの逆変換は J-DS と同一ルール。

#### 単値フィールド

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `studyTitle.ja` | `use_study_title` | string | J-DS とは key が異なる |
| `studyTitle.en` | `use_study_title_en` | string | J-DS とは key が異なる |
| `usePurpose` | `use_purpose` | string | |
| `useSummary` | `use_summary` | string | |
| `usePublication` | `use_publication` | string | |

#### usePeriod

| transformed フィールド | component key | 型 |
|------------------------|---------------|------|
| `usePeriod.start` | `use_period_start` | string |
| `usePeriod.end` | `use_period_end` | string |

#### useReview

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `useReview.status` | `use_review_status` | string | UseReviewStatus union |
| `useReview.date` | `use_review_date` | string | |

#### server

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `server.status` | `server_status` | string | ServerLocation union |
| `server.offPremiseStatus` | `off_premise_server_status` | string[] | multiValue (複数行) |
| `server.isOffPremiseStatement` | `is_off_premise_server_statement` | boolean | `true` -> `"TRUE"` |
| `server.acknowledgmentStatus` | `acknowledgment_status` | string | YesNo |

`server.offPremiseStatus` は配列だが、multiValue グループではなく単独キーの複数行。各要素を `off_premise_server_status` key で 1 行ずつ挿入する。

#### publicKey

| transformed フィールド | component key | 型 |
|------------------------|---------------|------|
| `publicKey.file` | `public_key_file` | string |
| `publicKey.txt` | `public_key_txt` | string |
| `publicKey.key` | `public_key` | string |

#### report

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `report.summary` | `report_summary` | string | |
| `report.publication` | `report_publication` | string | |
| `report.intellectualProperty` | `report_intellectual_property` | string | |
| `report.nbdcSharingGuidelineStatus` | `nbdc_sharing_guideline_status` | string | YesNo |
| `report.nbdcSharingGuidelineDetail` | `nbdc_sharing_guideline_detail` | string | |
| `report.newReportStatus` | `new_report_status` | string | |

#### deletion

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `deletion.date` | `deletion_date` | string | |
| `deletion.keepSecondaryDataStatus` | `keep_secondary_data_status` | string | YesNo |
| `deletion.keepSecondaryDataDetail` | `keep_secondary_data_detail` | string | |

#### distribution

| transformed フィールド | component key | 型 | 備考 |
|------------------------|---------------|------|------|
| `distribution.status` | `distributing_processed_data_status` | string | YesNo |
| `distribution.detail` | `distributing_processed_data_detail` | string | |
| `distribution.way` | `distributing_processed_data_way` | string | |
| `distribution.isStatement1` | `is_distribute_processed_data_statement1` | boolean | `true` -> `"TRUE"` |
| `distribution.isStatement2` | `is_distribute_processed_data_statement2` | boolean | `true` -> `"TRUE"` |

#### multiValue: useDatasets[]

| transformed フィールド | component key | 型 |
|------------------------|---------------|------|
| `useDatasets[i].request` | `use_dataset_request` | string |
| `useDatasets[i].purpose` | `use_dataset_purpose` | string |
| `useDatasets[i].id` | `use_dataset_id` | string |

#### multiValue: members[]

全 BilingualText の ja は常に null のため、en のみを逆変換する。

| transformed フィールド | component key | 型 |
|------------------------|---------------|------|
| `members[i].accountId` | `member_account_id` | string |
| `members[i].firstName.en` | `member_first_name_en` | string |
| `members[i].middleName.en` | `member_middle_name_en` | string |
| `members[i].lastName.en` | `member_last_name_en` | string |
| `members[i].email` | `member_email` | string |
| `members[i].institution.en` | `member_institution_en` | string |
| `members[i].division.en` | `member_division_en` | string |
| `members[i].job.en` | `member_job_en` | string |
| `members[i].eradid` | `member_eradid` | string |
| `members[i].orcid` | `member_orcid` | string |

### 3.5 `nbdc_application` テーブルへの直接カラムマッピング

`nbdc_application` テーブルは EAV (`nbdc_application_component`) とは別に、主要フィールドを直接カラムとして保持する。逆変換時はこれらのカラムにも値を設定する。

| `nbdc_application` カラム | transformed フィールド | 備考 |
|---------------------------|------------------------|------|
| `ds_du_id` | `jdsId` (J-DS) / `jduId` (J-DU) | |
| `study_title` | `studyTitle.ja` | |
| `study_title_en` | `studyTitle.en` | |
| `pi_last_name` | `pi.lastName.ja` | |
| `pi_first_name` | `pi.firstName.ja` | |
| `pi_last_name_en` | `pi.lastName.en` | |
| `pi_first_name_en` | `pi.firstName.en` | |
| `pi_institution` | `pi.institution.ja` | |
| `pi_institution_en` | `pi.institution.en` | |
| `pi_division` | `pi.division.ja` | |
| `pi_division_en` | `pi.division.en` | |
| `create_date` | `createDate` | |

> **注意**: これらのカラムは `nbdc_application_component` と冗長。component 側の値が正とみなされるが、`nbdc_application` のカラムも一致させる必要がある。

## 4. DB 挿入ロジック

### 4.1 テーブル挿入順序

全挿入を単一トランザクション内で実行する。いずれかのステップで失敗した場合は全体をロールバックする。

```
BEGIN;

1. nbdc_application_master  (existence check, INSERT if missing)
2. nbdc_application          (INSERT, RETURNING appl_id)
3. nbdc_application_submit   (INSERT, RETURNING appl_submit_id)
4. nbdc_application_component (bulk INSERT)
5. nbdc_application_status_history (INSERT)
6. submission_permission / use_permission (optional)

COMMIT;
```

### 4.2 各テーブルの INSERT

#### Step 1: `nbdc_application_master`

申請マスターの存在を確認し、なければ作成する。

```sql
INSERT INTO ts_jgasys.nbdc_application_master (
  ds_du_id,
  data_type,
  account_group
)
VALUES ($1, $2, $3)
ON CONFLICT (ds_du_id) DO NOTHING;
```

| パラメータ | 値 |
|-----------|------|
| `$1` (ds_du_id) | `jdsId` or `jduId` |
| `$2` (data_type) | `1` (J-DS) or `2` (J-DU) |
| `$3` (account_group) | `control.groupId` |

#### Step 2: `nbdc_application`

```sql
INSERT INTO ts_jgasys.nbdc_application (
  ds_du_id,
  study_title,
  study_title_en,
  pi_last_name,
  pi_first_name,
  pi_last_name_en,
  pi_first_name_en,
  pi_institution,
  pi_institution_en,
  pi_division,
  pi_division_en,
  create_date
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING appl_id;
```

| パラメータ | transformed フィールド |
|-----------|------------------------|
| `$1` | `jdsId` / `jduId` |
| `$2` | `studyTitle.ja` |
| `$3` | `studyTitle.en` |
| `$4` | `pi.lastName.ja` |
| `$5` | `pi.firstName.ja` |
| `$6` | `pi.lastName.en` |
| `$7` | `pi.firstName.en` |
| `$8` | `pi.institution.ja` |
| `$9` | `pi.institution.en` |
| `$10` | `pi.division.ja` |
| `$11` | `pi.division.en` |
| `$12` | `createDate` |

#### Step 3: `nbdc_application_submit`

```sql
INSERT INTO ts_jgasys.nbdc_application_submit (
  appl_id,
  submit_date
)
VALUES ($1, $2)
RETURNING appl_submit_id;
```

| パラメータ | 値 |
|-----------|------|
| `$1` | Step 2 で取得した `appl_id` |
| `$2` | `submitDate` |

#### Step 4: `nbdc_application_component` (バルク INSERT)

逆変換で生成した全 `(key, value)` ペアを一括挿入する。

```sql
INSERT INTO ts_jgasys.nbdc_application_component (
  appl_submit_id,
  key,
  value,
  t_order
)
VALUES ($1, $2, $3, $4);
```

| パラメータ | 値 |
|-----------|------|
| `$1` | Step 3 で取得した `appl_submit_id` |
| `$2` | component key (セクション 3 のマッピング表参照) |
| `$3` | component value |
| `$4` | 表示順序 (後述) |

実装では `VALUES` を複数行まとめてバルク INSERT する。

```sql
INSERT INTO ts_jgasys.nbdc_application_component (
  appl_submit_id, key, value, t_order
)
VALUES
  ($1, 'submission_study_title', $2, 0),
  ($1, 'submission_study_title_en', $3, 1),
  ...
;
```

#### Step 5: `nbdc_application_status_history`

`statusHistory` 配列の各エントリを挿入する。

```sql
INSERT INTO ts_jgasys.nbdc_application_status_history (
  appl_id,
  appl_status_type,
  history_date
)
VALUES ($1, $2, $3);
```

| パラメータ | 値 |
|-----------|------|
| `$1` | Step 2 で取得した `appl_id` |
| `$2` | `statusHistory[i].status` (StatusCode) |
| `$3` | `statusHistory[i].date` |

> **注意**: `statusLabel` は STATUS_LABELS 定数から導出されるため、DB には `status` (integer) のみ保存する。

#### Step 6: `submission_permission` / `use_permission` (任意)

外部 ID との紐付けが必要な場合のみ実行する。

**J-DS の場合** (`submission_permission`):

```sql
INSERT INTO ts_jgasys.submission_permission (
  appl_id,
  submission_id,
  submission_comment
)
VALUES ($1, $2, $3);
```

`submission_id` は `jsubIds` / `jgaIds` から `submission` テーブルを逆引きして取得する。

**J-DU の場合** (`use_permission`):

```sql
INSERT INTO ts_jgasys.use_permission (
  appl_id,
  dataset_id
)
VALUES ($1, $2);
```

`dataset_id` は `jgadIds` から `accession` テーブルを逆引きして取得する。

## 5. バリデーションルール

### 5.1 必須フィールド

| フィールド | 対象 | 説明 |
|-----------|------|------|
| `jdsId` | J-DS | J-DS ID。`"J-DS"` prefix 必須 |
| `jduId` | J-DU | J-DU ID。`"J-DU"` prefix 必須 |
| `createDate` | 共通 | ISO 8601 datetime |
| `submitDate` | 共通 | ISO 8601 datetime |
| `control.groupId` | 共通 | グループ ID。空文字不可 |
| `statusHistory` | 共通 | 1 件以上必須 |

### 5.2 形式バリデーション

| フィールド | 許容値 |
|-----------|--------|
| `statusHistory[].status` | `10`, `20`, `30`, `40`, `50`, `60`, `70`, `80` |
| `data[].dataAccess` | `"submission_open"`, `"submission_type1"`, `"submission_type2"` |
| `server.status` | `"onpre"`, `"offpre"`, `"both"` |
| `server.offPremiseStatus[]` | `"nig"`, `"tombo"`, `"hgc"`, `"kog"` |
| `useReview.status` | `"completed"`, `"notyet"`, `"unnecessary"` |
| `control.lang` | `"ja"`, `"en"` |

YesNo フィールド (`"yes"` / `"no"`) のバリデーション対象:

- `collaborators[].seminar`
- `review.nbdcGuidelineStatus`
- `server.acknowledgmentStatus`
- `report.nbdcSharingGuidelineStatus`
- `deletion.keepSecondaryDataStatus`
- `distribution.status`

### 5.3 整合性チェック

| チェック | 説明 |
|---------|------|
| `ds_du_id` 重複 | `nbdc_application` に同一 `ds_du_id` が存在しないことを確認。存在する場合は 409 |
| prefix 一致 | J-DS エンドポイントには `"J-DS"` prefix の ID、J-DU には `"J-DU"` prefix の ID のみ受け付ける |
| multiValue 整合性 | 同一 multiValue グループ内の各キー配列長が一致すること (padding 不要) |

## 6. エラーハンドリング

### HTTP ステータスコード一覧

| ステータス | エラーコード | 原因 |
|-----------|-------------|------|
| 400 | `VALIDATION_ERROR` | 必須フィールド欠損、形式不正 |
| 400 | `INVALID_PREFIX` | エンドポイントと ID prefix の不一致 |
| 409 | `DUPLICATE_APPLICATION` | 同一 `ds_du_id` が既に存在 |
| 500 | `INSERT_FAILED` | トランザクション内での INSERT 失敗 |
| 500 | `INTERNAL_ERROR` | 予期しないサーバーエラー |

### エラーレスポンス形式

```typescript
interface ErrorResponse {
  error: string      // エラーコード (SCREAMING_SNAKE_CASE)
  message: string    // 人間可読なエラーメッセージ
  details?: Array<{  // バリデーションエラーの詳細 (400 のみ)
    field: string    // ドット区切りのフィールドパス
    reason: string   // "required" | "invalid_format" | "invalid_value"
  }>
  existingApplId?: number  // 重複時の既存 appl_id (409 のみ)
}
```

## 7. エッジケースと未確定事項

### 7.1 情報の非可逆性

正方向変換の `toBooleanOrNull` は `"TRUE"`, `"true"`, `"ok"` をすべて `true` に変換する。逆変換では `true` -> `"TRUE"` に一律変換するため、元値が `"ok"` や `"true"` だった場合は復元できない。

**影響を受けるフィールド**:

- `review.companyUseStatus`: 元値 `"ok"` -> 正方向で `true` にはならない (as-is で string として保持されている)。このフィールドは boolean 変換対象外のため問題なし
- `review.nbdcDataProcessingStatus`: 同上
- `control.isEditAccount`, `control.isNoneCollaborator` 等の `is_*` フィールド: 元値が `"ok"` の可能性あり

> **判断**: 実データを確認した結果、`is_*` prefix のフィールドの元値はほぼ `"TRUE"` / `"FALSE"` であり、`"ok"` が使われるケースは `*_status` 系フィールド (boolean 変換対象外) に限定される。逆変換で `"TRUE"` 固定としても実用上の問題は低い。

### 7.2 t_order の決定ルール

`nbdc_application_component.t_order` は表示順序を示す integer。元データの `t_order` は transformed JSON に含まれていない (正方向変換で捨てられている)。

**暫定ルール**:

1. 単値フィールド: マッピング表の出現順に連番 (0, 1, 2, ...)
2. multiValue グループ: 配列 index をそのまま使用
3. グループ間の順序: 単値 -> multiValue の順。グループ内はマッピング表の定義順

> **未確定**: 既存データの `t_order` 値を解析し、法則性があればそれに合わせる必要がある。

### 7.3 トランザクション失敗時のリカバリ

全ステップを単一トランザクションで実行するため、途中失敗時は自動ロールバックされる。リトライは呼び出し側の責務とする。

### 7.4 `submission_permission` / `use_permission` の accession 逆引き

- `jsubIds` / `jgaIds` から `submission` テーブルの `submission_id` を特定するには、`accession` -> `relation` -> `entry` -> `submission` を辿る必要がある
- `jgadIds` から `accession.accession_id` を特定するには、`accession.accession` カラムで直接検索する
- これらの外部 ID が `accession` テーブルに未登録の場合、Step 6 はスキップする (エラーにしない)

### 7.5 `nbdc_application` の冗長カラム

`nbdc_application` テーブルの `study_title`, `pi_*` 等のカラムは `nbdc_application_component` の EAV データと冗長。逆変換時は両方に同一値を設定する。将来的にどちらを正とするかは既存システムの挙動に依存する。

### 7.6 未確定事項

以下の項目は実装前に JGA 申請システム側と確認が必要。

| 項目 | 現状の想定 | 確認が必要な理由 |
|------|-----------|----------------|
| `appl_id` の採番方法 | DB の serial/sequence による自動採番 | 外部から指定する要件があるか不明 |
| `ds_du_id` の発番ルール | リクエストで受け取った値をそのまま使用 | 新規発番が必要な場合のフォーマットルール (`J-DS` + 6 桁ゼロ埋め等) が不明 |
| `nbdc_application_master` の事前存在要否 | なければ INSERT (ON CONFLICT DO NOTHING) | 事前に管理者が作成する運用の場合、存在しなければエラーとすべき |
| `hum_id` カラムの扱い | `null` で INSERT (将来拡充予定のため) | `humIds` 配列の値を設定すべきか |
| `appl_submit_id` の採番方法 | DB の serial/sequence による自動採番 | `appl_id` と同様 |
| `t_order` の既存ルール | 連番を仮割り当て | 既存データに法則性があるか要調査 |
| Step 6 の必須/任意 | 任意 (外部 ID が存在する場合のみ) | 必須とすべきケースがあるか |
