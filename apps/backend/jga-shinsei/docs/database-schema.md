# JGA Shinsei Database Schema

## スキーマ

- `ts_jgasys` - メインスキーマ

## 主要テーブル

### accession と metadata

```plaintext
accession (1) -----> (1) metadata
              accession_id
```

- `accession`: JGA ID を管理 (accession, alias)
- `metadata`: XML 形式のメタデータを格納

### JGA ID の階層 (relation)

```plaintext
submission (1) ----> (*) entry ----> (*) relation
             submission_id     entry_id

relation.self   --> accession (自分自身)
relation.parent --> accession (親 ID)
```

- `relation` テーブルで JGA ID 間の親子関係を管理

### J-DS との紐付け (submission_permission)

```plaintext
nbdc_application --> submission_permission --> submission
    |                       |
    v                       v
ds_du_id (J-DS)       submission_id (FK)
```

- `submission_permission` テーブルで J-DS と submission を直接紐付け
- `appl_id` と `submission_id` の組み合わせで 1:1 対応

### J-DU との紐付け (use_permission)

```plaintext
nbdc_application --> use_permission --> accession (JGAD)
    |                   |
    v                   v
ds_du_id (J-DU)    dataset_id (FK)
```

- `nbdc_application.ds_du_id` が J-DU ID
- `use_permission.dataset_id` で JGAD に紐付く

## 申請関連テーブル構造

```plaintext
nbdc_application_master (申請マスター)
├── ds_du_id (J-DS/J-DU ID)
├── data_type (1=J-DS, 2=J-DU)
└── account_group (group_id との紐付け)

nbdc_application (申請メイン)
├── appl_id (PK)
├── ds_du_id (J-DS/J-DU ID)
├── hum_id (将来拡充予定、現在はほぼ未入力)
├── study_title, study_title_en
├── pi_last_name, pi_first_name, ... (申請者情報)
└── create_date

nbdc_application_submit (申請提出)
├── appl_submit_id (PK)
├── appl_id (FK)
└── submit_date

nbdc_application_component (申請フォーム key-value)
├── appl_component_id (PK)
├── appl_submit_id (FK)
├── key (フィールド名)
├── value (フィールド値)
└── t_order (表示順序)

nbdc_application_status_history (ステータス履歴)
├── appl_status_history_id (PK)
├── appl_id (FK)
├── appl_status_type (ステータスコード)
└── history_date

submission_permission (J-DS <-> submission 紐付け)
├── submission_permission_id (PK)
├── appl_id (FK -> nbdc_application)
├── submission_id (FK -> submission)
└── submission_comment

use_permission (J-DU <-> JGAD 紐付け)
├── appl_id (FK -> nbdc_application)
└── dataset_id (FK -> accession)
```

## 申請ステータスコード

`nbdc_application_status_history.appl_status_type` は integer 型で、以下の値を取る:

| コード | 意味 | 説明 |
|--------|------|------|
| 10 | 作成 | 申請が作成された |
| 20 | 提出 | 申請が提出された |
| 30 | - | (未確認) |
| 40 | 審査中 | NBDC で審査中 |
| 50 | - | (未確認) |
| 60 | 承認 | 申請が承認された |
| 70 | - | (未確認) |
| 80 | 終了 | 利用期間終了など |

## 主要な component key

> **注意**: DB には key 名のラベルや説明を管理するマスターテーブルは存在しない。
> `nbdc_application_component.key` は単なる text 型で、外部キー参照もない。
> フォームフィールドの定義（ラベル、human-readable な名前）はアプリケーション側で管理されていると推測される。
> 以下の説明は実データから推測したもの。

### J-DS (データ提供申請)

| key | 説明 |
|-----|------|
| `submission_study_title` | 研究題目 |
| `submission_study_title_en` | 研究題目（英語） |
| `aim` | 研究目的 |
| `aim_en` | 研究目的（英語） |
| `method` | 研究方法 |
| `method_en` | 研究方法（英語） |
| `participant` | 研究参加者 |
| `participant_en` | 研究参加者（英語） |
| `restriction` | 利用制限 |
| `restriction_en` | 利用制限（英語） |
| `data_access` | アクセス制限 (submission_open, submission_controlled) |
| `study_type` | 研究種別 (study_type_wgs, etc.) |
| `file_format` | ファイル形式 |
| `file_size` | ファイルサイズ |
| `release_date` | 公開予定日 |
| `icd10` | ICD-10 コード |
| `pi_*` | 申請者情報 |
| `head_*` | 機関長情報 |
| `group_id` | グループ ID (submission との紐付け) |

### J-DU (データ利用申請)

| key | 説明 |
|-----|------|
| `use_study_title` | 利用研究題目 |
| `use_study_title_en` | 利用研究題目（英語） |
| `use_purpose` | 利用目的 |
| `use_summary` | 利用概要 |
| `use_publication` | 発表予定 |
| `use_dataset_request` | 申請対象 JGAD ID |
| `use_dataset_purpose` | データセット利用目的 |
| `use_period_start` | 利用開始日 |
| `use_period_end` | 利用終了日 |
| `server_status` | サーバー環境 (onpre, cloud) |
| `public_key` | 公開鍵 |
| `pi_*` | 申請者情報 |
| `submitter_*` | 提出者情報 |
| `member_*` | メンバー情報 |
| `collaborator_*` | 共同研究者情報 |
| `group_id` | グループ ID |

## ステータス管理

### status テーブル (submission 処理パイプライン)

submission 単位の処理パイプラインのステータス。メタデータ更新のたびに遷移し、何度も行き来する。**公開判定には使えない**。

| status_type | 推測 |
| --- | --- |
| 0 | 初期/アイドル |
| 200 | submitted (提出) |
| 300 | validating (検証中) |
| 400 | validated (検証完了) |
| 450 | validation with warnings |
| 500 | curating (キュレーション中) |
| 600 | processed (処理済み) |
| 800 | released (リリース処理完了) |
| 2000 | 用途不明（suppress 的な操作後にも 600 に戻る） |

典型的な遷移例 (JGAS000025):

```plaintext
0 -> 200 -> 300 -> 400 -> 500 -> 600 -> 800
  -> 600 -> 2000 -> 600 -> 800 -> 600 -> 800 -> 0
```

### current_accession_status (accession 公開状況)

accession 単位の公開状況を管理するビュー。ビットフラグ方式。

```plaintext
accession_status | hex      | bit21 | bit20 | bit10 | bit3 | bit2 | bit1
-----------------|----------|-------|-------|-------|------|------|-----
1049602          | 0x100402 |   .   |   o   |   o   |  .   |  .   |  o
1049604          | 0x100404 |   .   |   o   |   o   |  .   |  o   |  .
1049610          | 0x10040A |   .   |   o   |   o   |  o   |  .   |  o
2098178          | 0x200402 |   o   |   .   |   o   |  .   |  .   |  o
2098186          | 0x20040A |   o   |   .   |   o   |  o   |  .   |  o
```

| ビット | 推測 |
| --- | --- |
| bit21 (0x200000) | public グループ |
| bit20 (0x100000) | private グループ |
| bit10 (0x000400) | 共通（全レコードにセット） |
| bit3 (0x000008) | live フラグ |
| bit2 (0x000004) | 用途不明 |
| bit1 (0x000002) | 共通（ほぼ全レコードにセット） |

**公開済み = `accession_status = 2098186` (bit21 + bit3)**

典型的なライフサイクル:

```plaintext
1049602 (private) -> 2098178 (public/hold) -> 2098186 (public/live)
```

DDBJ Search との対応 (2026-04-09 調査):

| accession_status | JGAS 件数 | JGAD 件数 | Search |
| --- | --- | --- | --- |
| 2098186 | 534 | 667 | 全件ヒット |
| 1049602 | 337 | 344 | 全件ヒットしない |
| 1049604 | 17 | 19 | 全件ヒットしない |
| 1049610 | 4 | 5 | 全件ヒットしない |
| 2098178 | 2 | 3 | 全件ヒットしない |

## 確認コマンド

```sql
-- スキーマ一覧
\dn

-- テーブル一覧
\dt ts_jgasys.*

-- テーブル構造確認（例）
\d ts_jgasys.accession
```
