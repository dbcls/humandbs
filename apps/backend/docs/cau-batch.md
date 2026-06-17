# CAU バッチ生成

データ利用者一覧 (controlledAccessUser, CAU) を申請管理システム (jgadb) から日次バッチで取得し、Elasticsearch の research index に反映する。

従来 Joomla 由来の手編集データを crawler が取り込んでいた CAU を、jgadb の J-DU を SSOT (Single Source of Truth) とする方式に切り替える。API 経由の CAU 編集は廃止し、バッチが唯一の書き込み経路となる。

## アーキテクチャ

```plaintext
jgadb (production, read-only)
    │ SQL (postgres.js, 既存 jga-shinsei DB client 経由)
    ▼
generate-cau (src/cau/)
    │ Step 0: 名寄せ (union-find)
    │ Step 1: 承認 version の person × JGAD 展開
    │ Step 2: (person, JGAD) rollup
    │ Step 3: JGAD → hum_id 解決
    │ Step 4: (person, hum) rollup
    ▼
ES research index: controlledAccessUser[] 全クリア → 再投入
```

## 入力: jgadb 抽出

jgadb (schema `jgasys`) から 5 種のデータを SQL で抽出する。

| 抽出 | 内容 | 粒度 |
|---|---|---|
| core | J-DU の version 情報 + PI + 承認 status | (ds_du_id, appl_id, appl_version) |
| people | member + collaborator | (appl_id, role, idx) |
| jgad | 利用許可 JGAD (use_permission ∪ EAV) | (appl_id, jgad) |
| du-phase | DU の現在 phase + 遷移日 + 利用期限 | ds_du_id |
| jgad-humid | JGAD → hum_id マップ (DS 経路) | jgad |

DB 接続は既存の `jgaSql` client (`src/api/db-client/client.ts`) を再利用する。

## パイプライン

### Step 0: 名寄せ (entity resolution)

PI / member / collaborator の全出現 (occurrence) を union-find で統合し、canonical person を生成する。

email を一意の person 識別子とする (account_id=groupmanager は identity の最終根拠にしない)。

統合シグナル (上から順に適用):

| # | シグナル | 条件 |
|---|---|---|
| 1 | ORCID 一致 | 無条件 |
| 2 | eRadID 一致 | 無条件 |
| 3 | email 一致 | 無条件 |
| 4 | 氏名トークン + institution 一致 | 無条件 (NFKC / lowercase / punctuation 除去 / 順序非依存) |
| 5 | account_id 一致 | name-guard 付き: 氏名トークンが互いに素なら統合しない |

canonical person の各フィールドは、cluster 内で最新の submit_date を持つ occurrence から採用する。

### Step 1: 承認 version の person × JGAD 展開

- 対象: in-scope DU (phase ∈ {160, 190, 200, 210, 220})
- 承認 version のみ (appl_status_type = 60)
- person × JGAD を同一 version 内で結合 (cross-version 結合は過剰許可になるため不可)
- 各 DU の latest approved version を追跡

### Step 2: (person, JGAD) rollup

複数 DU・複数承認 version を (person, JGAD) 単位で集約する。

- 行の存在 = いずれかの承認 version で person と JGAD が共起
- current = 利用中 DU (phase 160/210) の最新承認版 grant に含まれる
- ended = 行は在るが current でない
- startDate = min(phase 160 遷移日)
- endDate = current なら max(利用期限) / ended なら max(終了遷移日)
- role = PI > member > collaborator (最上位を採用)

### Step 3: JGAD → hum_id 解決

DS 経路で JGAD を hum_id に解決する。公開 JGAD (`accession_status=2098186`) のみ対象。2 系統を UNION する:

1. **直接経路**: J-DS の hum_id → submission_permission → submission → entry → relation → accession (JGAD)
2. **JGAS ブリッジ経路**: hum_id=NULL の J-DS 配下にある JGAD について、同一 entry 内の兄弟 JGAS を経由し、その JGAS が別 entry に存在する submission の hum_id に到達する

不変条件: 1 JGAD : 1 hum_id。一意性を assert し、違反はログに出す。

### Step 4: (person, hum) rollup

(person, JGAD) を (person, hum) に集約する。

- いずれかの JGAD が current → current
- datasetIds = その person × hum の全 JGAD
- startDate = min(全 JGAD の startDate)
- endDate = current なら max(利用期限) / ended なら max(終了遷移日)

## 出力: PersonSchema へのマッピング

既存の `PersonSchema` (`src/crawler/types/structured.ts`) をそのまま使用する。型変更なし。

| PersonSchema field | CAU 出力からの源 |
|---|---|
| `name.en.text` | `{enFamily} {enGiven}` (PI/member)。collaborator は displayName がローマ字の場合 |
| `name.ja.text` | `{jaFamily}{jaGiven}` (PI のみ)。collaborator は displayName が CJK の場合 |
| `email` | canonical email |
| `orcid` | ORCID (あれば) |
| `organization.name` | affiliation (en のみ) |
| `datasetIds` | JGAD list (person × hum 単位) |
| `periodOfDataUse.startDate` | phase 160 遷移日 (YYYY-MM-DD) |
| `periodOfDataUse.endDate` | current: 利用期限 / ended: 終了遷移日 (YYYY-MM-DD、空の場合 null) |

collaborator の displayName は script 判定 (CJK → ja、ローマ字 → en) で振り分ける。

## ES 更新

1. 全 research ドキュメントの `controlledAccessUser` を `[]` にリセット (`updateByQuery`)
2. jgadb 出力に含まれる hum ごとに `controlledAccessUser` を部分更新

API 経由の CAU 編集は廃止済みのため、バッチが唯一の書き込み経路。

## 除外リスト

### email (事務局・運用アカウント + 規約違反)

- `humandbs+agent@dbcls.jp`
- `humhisec@biosciencedbc.jp`
- `sakhliza2@gmail.com` (同一 email を別人が共有 = 利用規約違反)

### 氏名トークン (事務局)

- `secretariat NBDC`

## 実行方法

```bash
docker compose exec backend bun run generate-cau [--dry-run] [--hum-id hum0001] [--verbose]
```

| オプション | 説明 |
|---|---|
| `--dry-run` | ES 更新をスキップし、更新予定の件数のみ表示 |
| `--hum-id` | 指定した hum のみ更新 (デバッグ用) |
| `--verbose` | 詳細ログ出力 |

## cron 設定 (a014)

日次 2:30 に実行。既存の `dump-jga-hum-relations.sh` (2:00) の後に配置する。

```cron
30 2 * * * cd /path/to/humandbs && docker compose exec -T backend bun run generate-cau >> /var/log/humandbs/generate-cau.log 2>&1
```
