# API ガイド

HumanDBs Backend REST API の **横断的な仕様と設計の WHY** を扱う。エンドポイント単位の request/response や認証要否は OpenAPI ドキュメント（Swagger UI）が SSOT であり、本ガイドはそれを補完する。

## 1. このガイドの読み方

### SSOT の分担

| 観点 | SSOT | 例 |
|---|---|---|
| エンドポイント単位の request/response、認証要否、例 | OpenAPI (Swagger UI `/docs`) | `POST /research/new` のボディ schema、400 (VALIDATION_ERROR) の detail 例 |
| 横断的な概念・運用ルール・WHY | 本ガイド | 楽観的ロックの使い方、検索のセマンティクス、ページネーションの罠 |

OpenAPI ドキュメントは `tag` description / route description / examples でリソースの shape と振る舞いを記述する。本ガイドは「複数 operation にまたがる概念」「実装の WHY」「非自明な運用上の罠」だけを扱い、operation 単位の記述は重複させない。本ガイドから個別 operation を参照する場合は各章末「関連 OpenAPI 参照」に operationId を列挙する（Swagger UI deep link は `/docs#/<tag>/<operationId>` 形式）。

### Swagger UI URL

| 環境 | URL |
|---|---|
| Local | <http://localhost:8080/api/docs> |
| Staging | <https://humandbs-staging.ddbj.nig.ac.jp/api/docs> |
| Production | <https://humandbs.dbcls.jp/api/docs> |

Swagger UI の deep link は `<base>/docs#/<tag>/<operationId>` 形式（例: `<base>/docs#/Research/listResearch`）。本ガイドでは個別 operation へのハードリンクは貼らず、各章末「関連 OpenAPI 参照」に operationId を列挙する。

---

## 2. アーキテクチャ概観

詳細設計は [architecture.md](architecture.md) を SSOT とする。本章はガイド全体の見取り図として最小限の概要のみ扱う。

### リソース構成

- **Research** (`/research`) — 研究単位。1 つの humId（例: `hum0001`）。複数の **Dataset** を持つ
- **Dataset** (`/dataset`) — Research に従属するデータセット単位（例: `JGAD000001`）。1 つの Research に対し 1:N
- **Version** — Research / Dataset それぞれが独立にバージョン管理される。Research 公開時に紐づく Dataset の version が確定する
- **JGA Shinsei** (`/jga-shinsei`) — JGA 申請データの read-only な参照 API（DS = データ提供申請 / DU = データ利用申請）

### 多言語表現

list / detail エンドポイントの一部フィールドは `BilingualText` 形式で返る:

```json
{ "title": { "ja": "...", "en": "..." } }
```

- `null` は「その言語の翻訳が未作成」を意味する
- `lang` クエリパラメータで「単一言語の文字列」を返す形に切り替えるフィールドもある（`methods`, `targets` 等）
- 詳細な区別は OpenAPI の各 response schema を参照

### 関連 OpenAPI 参照

- tag: `Research`, `Dataset`, `JGA Shinsei`
- 主要 operationId: `getResearch`, `getDataset`, `listResearch`, `listDatasets`

---

## 3. 認証と認可

### Keycloak OIDC トークン取得

API は Keycloak OIDC の Authorization Code (PKCE) flow を採用する。クライアントが Keycloak からアクセストークンを取得し、`Authorization: Bearer <token>` ヘッダーで API を呼び出す。

- **トークンエンドポイント / authorizationUrl**: OpenAPI の `components.securitySchemes.oauth2.flows.authorizationCode` を参照（Keycloak realm の URL を runtime に解決して埋め込まれる）
- **clientId**: フロントエンド・Swagger UI からは public な clientId を使用。`HUMANDBS_AUTH_CLIENT_ID` 環境変数で運用環境ごとに切り替え
- **Swagger UI の Authorize ボタン**: PKCE フローを発火し、Keycloak ログイン後にトークンを保持して try-it-out に渡す。Keycloak 側で `<base>/docs/oauth2-redirect.html` を **Valid Redirect URIs** に追加する運用設定が必要

### 認可レベル（3 段階）

| レベル | 認証 | アクセス範囲 |
|---|---|---|
| **public** | なし | published な Research / Dataset とそれに紐づくファセット・統計のみ |
| **authenticated** | あり | public + `uids` に自分の Keycloak `sub` が含まれる Research / Dataset |
| **admin** | あり + `admin_uids.json` に登録 | 全リソース、ワークフロー操作、削除、UID 編集 |

admin 判定は Keycloak の scope / role ではなく、サーバー側の `admin_uids.json` ファイルで決まる（Keycloak アクセストークンに `admin` scope は載らない）。OpenAPI 上は `security: [{ oauth2: [] }]` のままで、admin-only operation は description 冒頭の `**Authorization:** Admin only` で明示しつつ、機械可読なマーカーとして `x-admin-only: true` の vendor extension を付与する（テストは後者を見て一覧と突き合わせる）。

### Research.uids 所有者モデル

- Research を作成すると admin が `uids` に Keycloak `sub` を追加できる
- `uids` に含まれるユーザーは authenticated 扱いの操作（編集・version 作成・submit）を所有 Research に対して実行できる
- `uids` 編集自体は admin 専用

### 関連 OpenAPI 参照

- securityScheme: `oauth2` (Authorization Code + PKCE)
- 認証必須 operation: `updateResearch`, `updateDataset`, `submitResearch`, `createResearchVersion`, `checkIsAdmin`, etc.
- admin-only operation: `createResearch`, `deleteResearch`, `approveResearch`, `rejectResearch`, `unpublishResearch`, `updateResearchUids`, `deleteDataset`, JGA Shinsei 全 endpoint

---

## 4. ワークフロー

Research のライフサイクル: `draft → review → published`。詳細は [architecture.md](architecture.md#状態遷移ワークフロー)。

| status | 編集可否 | 公開 | 主な遷移 |
|---|---|---|---|
| `draft` | 所有者・admin が編集可 | 非公開 | `submit` → `review` |
| `review` | 編集不可（admin が判定） | 非公開 | `approve` → `published` / `reject` → `draft` |
| `published` | `patch` で軽微修正可 | 公開（`latestVersion`） | `patch`（同一版で修正） / `unpublish` → `draft` / `createResearchVersion` → 新 draft version |

### published 中の編集

published 状態の Research / Dataset にはバージョンを上げずに軽微な修正を加える **patch** エンドポイントがある。

- `PUT /research/{humId}/patch` — published Research の内容を直接修正（owner/admin）
- `PUT /dataset/{datasetId}/patch` — published Dataset の内容を直接修正（親 Research が published のとき、owner/admin）

バージョン番号・状態は変わらず `dateModified` のみ更新される。承認フロー（submit/approve）は不要。大きな内容変更には従来どおり `createResearchVersion` で新 draft version を起こす。

### Dataset の編集制約

Dataset の create/update/delete は **親 Research が `draft` のときのみ** 許可される。`review` / `published` 中の Dataset 編集は 403/409 を返す（`patch` を除く）。

### 関連 OpenAPI 参照

- tag: `Research Status`
- operationId: `submitResearch`, `approveResearch`, `rejectResearch`, `unpublishResearch`, `patchResearch`, `patchDataset`

---

## 5. バージョニング

### Research version

- 採番は `v1`, `v2`, ... の連番
- `createResearchVersion` を呼ぶと前 version の Dataset リストを引き継いだ新 draft version が作られる
- 公開中の version は `latestVersion` フィールド、編集中は `draftVersion`

### Dataset version の自動 bump

published 済み Research の draft cycle 中に **初めて** Dataset を更新すると、サーバー側で `vN` → `v(N+1)` に自動 bump される（[architecture.md § 「初回更新」の判定](architecture.md#初回更新の判定)）。

- URL に `?version=` 未指定の場合、middleware が最新版に解決する
- レスポンスの `data.version` は **URL で指定した version とは異なる場合がある**（bump 後の新 version）
- クライアントは「PUT の戻り値の `data.version` と `meta._seq_no` で次の編集を行う」前提で実装する

### バージョン解決ルール

| パス | 解決対象 |
|---|---|
| `GET /research/{humId}` | `latestVersion`（public）/ `draftVersion`（authenticated・所有者）|
| `GET /research/{humId}?version=v1` | クエリ指定版 |
| `GET /research/{humId}/versions/{version}` | パス指定版 |
| `PUT /dataset/{datasetId}/update` （version 未指定） | 親 Research の draft cycle に応じて bump |

### 関連 OpenAPI 参照

- tag: `Research Versions`, `Dataset Versions`
- operationId: `listResearchVersions`, `getResearchVersion`, `createResearchVersion`, `listDatasetVersions`, `getDatasetVersion`, `updateDataset`

---

## 6. 楽観的ロック

更新系 API は ES の `_seq_no` / `_primary_term` を用いた楽観的ロックで同時編集の競合を検出する（仕組み詳細は [architecture.md § 楽観的ロック](architecture.md#楽観的ロック)）。

### クライアントの実装手順

1. **GET** でリソースを取得し、`meta._seq_no` と `meta._primary_term` を保持
2. ユーザーが編集
3. **PUT** で更新リクエスト → リクエストボディに `_seq_no` と `_primary_term` を含める
4. 成功時はレスポンスの `meta` に新しい `_seq_no` / `_primary_term` が返る。これを次の編集に使う
5. **409 Conflict** が返った場合は競合発生

### 409 Conflict が返ったときの対応パターン

| パターン | 説明 |
|---|---|
| 再取得して通知 | 最新データを GET し直し、「他のユーザーが更新しました」と通知 |
| 自動マージ | 最新データを取得し、ユーザーの変更を再適用して再送信（マージロジックが必要） |

「サーバー側で merge」は行わない。クライアントが選択する。

### 関連 OpenAPI 参照

- operationId: `updateResearch`, `updateDataset`, `updateResearchUids`
- 409 response: 全更新系 operation で `ErrorSpec409` を返す

---

## 7. ページネーション

オフセットベースのページネーション。`page` / `limit` は OpenAPI の各 query schema を参照（default `page=1`, `limit=20`, `MAX_LIMIT=100`）。

### `max_result_window` の罠

Elasticsearch の `index.max_result_window` (デフォルト 10000) を超える深さのページネーション (`(page - 1) * limit + limit > 10000`) は **エラーではなく空ページ**として返る:

```json
{ "data": [], "meta": { "pagination": { "page": 1001, "limit": 20, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false } } }
```

- `total` も `0` で返るため「該当 0 件」と区別がつかない
- クライアント側ではこの上限を意識した UI 制御（page navigator の最大値を `floor(10000 / limit)` に丸める等）が必要
- 対象: `listResearch`, `listDatasets`, `searchResearch`, `searchDataset`

### 関連 OpenAPI 参照

- operationId: `listResearch`, `listDatasets`, `searchResearch`, `searchDataset`

---

## 8. 検索アーキテクチャ

### 検索フロー

1. フロントエンドは `getFacets` (`GET /facets`) でファセット値（件数付き）を取得
2. ユーザーがファセット値を選択
3. `searchResearch` (`POST /research/search`) または `searchDataset` (`POST /dataset/search`) で検索
4. レスポンスに `includeFacets=true` で「フィルタ後の」ファセット件数も併せて取得

`GET /facets` / `GET /facets/{fieldName}` はファセット検索クエリを受け付ける。パラメータを指定するとマッチする Dataset に絞った件数、未指定ならグローバルカウントが返る。`fieldName` enum は `apps/backend/src/api/types/facets.ts` の `DATASET_FACET_NAMES` を SSOT とし、不正な名前は 400 を返す。

ファセット値は認証状態により変わる。public ユーザーには published Research に紐づく Dataset のファセットのみ返却される。

### Research 検索 vs Dataset 検索のフィルター構造

- **`POST /research/search`**: Dataset 属性によるフィルタは `datasetFilters` 配下にネスト。Research 自身の属性（`status`, `datePublished`, `dateModified`）はトップレベル
- **`POST /dataset/search`**: フィルタは `filters` 配下にネスト

`datePublished` / `dateModified` の `min` / `max` には **ISO 8601 の date または date-time** を渡すこと（例: `"2024-01-01"`、`"2024-01-01T00:00:00Z"`、`"2024-12-31T23:59:59+09:00"`）。スキーマ層で形式バリデーションを行うため、不正な文字列は 400 を返す。

構造を分けている理由: Research 検索は内部で「Dataset を引いて親 Research をヒットさせる」処理を含むため、Research 自身の属性と Dataset 属性をクエリビルダ上で明確に分離する必要があるため。

#### Research 検索の Dataset 横断検索

Research のフリーテキスト検索は、Research 自身の `all_text` に加え、子 Dataset の `all_text` も横断検索する。子 Dataset のみにヒットする語（例: `experiments.data` 中のマッピング手法名 "Novoalign"）で検索しても、親 Research が結果に含まれる。

内部実装: `getHumIdsByTextQuery()` で Dataset index にテキストクエリを投げ、親 `humId` 群を OR 条件で Research クエリに合流させる（既存の `getHumIdsByDatasetIdQuery()` と同パターン）。Research 自身のテキスト一致と Dataset 経由のテキスト一致は `should`（OR）で結合されるため、どちらか一方でも一致すれば結果に含まれる。

### フリーテキスト検索の挙動

`query` パラメータは入力を分類し、ID 系は完全一致ルックアップ、自然文は本文 + facet 値の全文検索（`all_text`）へ振り分ける。trim 後、引用符を尊重して空白で語分割し、**各語を「ID → 引用符/記号 → bare」の順**で判定する（ID 判定を最優先するのは、`E-GEAD-…` のハイフンや NBDC dataset ID のドットが記号フレージングに食われないようにするため）。

| 入力例 | 分類 | ヒット経路 |
|---|---|---|
| `hum0003` | ID（humId） | `humId` の完全一致のみ。配下 Dataset / 当該 Research を返し、`all_text` は引かない |
| `JGAD000001`, `DRA000908`, `E-GEAD-1051`, `MTBKS213`, `PRJDB10452`, `hum0013.v1.freq.v1` | ID（datasetId） | `datasetId` の完全一致。Research 検索では Dataset index を引き親 `humId` 経由でヒット |
| `hum000`, `JGAD00`, `E-GEAD-10` | ID（前方） | 該当 ID の前方一致 |
| `cancer` | text（1 語） | `all_text` の全文一致。末尾語なので前方一致も相乗り（`canc` → `cancer`） |
| `lung cancer` | text（複数語） | `all_text` に `lung` AND `cancer`（語順不問）。隣接フレーズはスコア上位 |
| `HIF-1`, `BRCA-1` | text（記号） | 記号を含む語はフレーズ一致（`match_phrase`）として扱い、analyzer 分割によるヒット増を防ぐ。前方一致は付けない |
| `"whole genome"` | text（引用） | 引用符で囲んだ範囲は厳密なフレーズ一致。前方一致は付けない |
| `JGAD000001 RNA-seq` | mixed | `datasetId` で絞り込み AND 本文 `RNA-seq` を全文一致 |
| `hum0001 cancer` | mixed | `humId` で絞り込み AND 本文 `cancer` を全文一致 |

- ID マッチは大文字小文字を区別しない。完全一致は `boost` でスコア最上位に並ぶ。
- 複数語は AND（全語一致）。語を減らすと自然に結果が広がる。引用符 / 記号フレーズと末尾語の前方一致でフレーズ・打ちかけ入力に対応する。
- ID パターン定義（research `humId` と dataset の 6 形式）は `apps/backend/src/api/es-client/id-patterns.ts` を SSOT とする。新しい外部 DB 由来の accession 体系が増えた場合はここを更新する。
- typo 許容（fuzziness）は行わない（ID の誤マッチを避けるため。下記「全文一致のセマンティクス」参照）。

#### catch-all field (`all_text`)

各 index は root に `all_text`（text 型）を持ち、自然文テキストと facet keyword を `copy_to` で集約する。フリーテキスト検索はこの `all_text` への一致でドキュメント全体（nested 配下を含む）を横断する。加えて `title`（Research）/ `typeOfData`（Dataset）は個別フィールドにも boost 付きでマッチさせ、スコア上位に並べる（ハイブリッド構成、`apps/backend/src/api/es-client/query-builders.ts § buildDatasetQueryClauses` / `§ buildResearchQueryClauses`）。

`all_text` に集約する値:

- **Research**: `title`, `summary.aims/methods/targets` の本文に加え、nested 配下の `dataProvider.name`, `researchProject.name`, `grant.title`, `grant.agency.name`, `relatedPublication.title`, `controlledAccessUser.name` 等の自然文テキスト
- **Dataset**: `typeOfData`, `experiments.header`, `experiments.dataText`（`experiments.data` の全テキスト値を連結した派生フィールド）, `experiments.searchable.targets` の本文に加え、facet 値 keyword（`criteria`, `diseases.label`, `tissues`, `population`, `cohorts`, `assayType`, `platforms.vendor/model`, `sex`, `ageGroup`, `fileTypes` 等）

`all_text` に含めないもの: ID / コード（`humId`, `datasetId`, `doi`, `icd10`, policy id）、数値・boolean フィールド、URL。ID は専用の term / prefix 経路で扱う。

`experiments.data` は `flattened` 型（Elasticsearch の仕様上 `copy_to` のソースにできない）だが、ingest 時に `experiments.dataText` へ全テキスト値を連結したコピーを生成し、`copy_to: all_text` で catch-all に含めている。

`all_text` を含む全 text フィールドは index 既定 analyzer（**kuromoji** 形態素解析。`apps/backend/src/es/analysis.ts`）でトークナイズされる。日本語は語境界で分割され（`肺がん` → `肺` / `がん`）、英語は小文字化される（`cancer` / `CANCER` は同一）。`all_text` は `copy_to` のターゲット（index 時のみ書き込まれる write-time フィールド）なので `_source` には現れず、Zod schema にも含まれない。

### 全文一致のセマンティクス

fuzziness（typo 許容）は使わない。ID 系の誤マッチ（例: `hum0003` が編集距離 1 で `hum0004` を含む別 study の Dataset にヒットする）を根絶するため、全文一致はすべて完全トークン一致とする。

| 観点 | 挙動 |
|---|---|
| 複数語 | AND（`operator: and`）。全語を含む文書のみ。語を減らすと広がる |
| 記号語（`-` `/` `.` `+` `:` を含む） | `match_phrase`。analyzer がトークン分割して無関係な文書にヒットするのを防ぐ（例: `HIF-1`）。ただし ID パターンに合致する語は ID として扱い、記号フレーズ化しない |
| 引用符 `"..."` | 厳密なフレーズ一致。前方一致は付けない |
| 末尾語の前方一致 | 入力末尾の bare 語（2 文字以上、ID/記号/引用でない）に `match_phrase_prefix` を相乗りさせ、打ちかけ入力に対応（`canc` → `cancer`、`Homo sap` → `Homo sapiens`）。text フィールドのみ（keyword の `humId` / `datasetId` は対象外） |
| ランキング | 隣接フレーズ一致と `title` / `typeOfData` 一致を `boost` し、関連度（`_score`）降順で上位に並べる |

ID 系（`humId` / `datasetId`）は term / prefix の完全一致経路で扱い、全文一致（`all_text`）は引かない。これにより ID クエリが本文中の似た文字列に巻き込まれない。

### sort / order の default

`sort` / `order` 未指定時の動作:

| 入力 | sort default | order default |
|---|---|---|
| `query` 指定あり | `relevance` | `desc` |
| `query` 指定なし | `humId`（Research） / `datasetId`（Dataset） | `asc` |

指定可能な `sort` の enum 値は OpenAPI の各 schema を参照。

Dataset の「更新日付 (Modification date)」での sort は `sort=dateModified`。`dateModified` は datasetId ごとの `max(versionReleaseDate)`（= 最新版の release 日付）を全 version doc に denormalize した version 不変フィールドで、これにより collapse された一覧でも asc / desc 両方で正しく整列する。version 可変の `versionReleaseDate` を直接 sort 値にはしない（collapse の代表選択により asc が崩れるため。詳細は `architecture.md`）。

### ファセット件数の単位（countBy）

ファセット値の `count` が「何の件数か」はエンドポイントによって異なる:

| エンドポイント | `count` の対象 |
|---|---|
| `searchResearch` (`includeFacets=true`) | Research 数（humId cardinality）|
| `searchDataset` (`includeFacets=true`) | Dataset 数（datasetId cardinality）|
| `getFacets`, `getFacet` | `countBy` で選択 (`research` = humId, `dataset` = datasetId, デフォルト `dataset`) |

Research 一覧画面のフィルタ UI では `countBy=research`、Dataset 一覧画面では `countBy=dataset` を指定するのが標準。同じレスポンス shape で `count` の意味のみ切り替わる。

### ファセット値の並び順

デフォルトは件数降順（count desc）。`apps/backend/src/api/data/facet-order.json` で優先値リストを定義したフィールドは、定義順で先頭に並び、残りが件数降順で続く（ES 結果に存在しない定義値は含まれない）。

### フィルタ動作の組み合わせ

| フィルタ種別 | 動作 | 例 |
|---|---|---|
| 配列フィルタ | OR（いずれかに一致）| `assayType=["WGS","WES"]` → WGS または WES |
| 複数フィルタ間 | AND（全条件を満たす）| `assayType=["WGS"]` + `healthStatus=["affected"]` → 両方を満たす |
| 部分一致 | 文字列の一部を含む | `disease="cancer"` → "lung cancer" にヒット |
| Range | min/max の範囲内 | `subjectCount={min:100}` → 100 以上 |

フィールドの型は `apps/backend/src/crawler/types/structured.ts` の `SearchableExperimentFieldsSchema`、ES mapping は `apps/backend/src/es/dataset-schema.ts` を参照。

### 複合検索例

```text
例1: 日本人のがんの WGS で GRCh38 マッピング済み
-> diseases: *cancer* AND population: Japanese AND assayType: WGS AND referenceGenome: *GRCh38*

例2: 血液サンプルの RNA-seq で 1000人以上
-> tissues: *blood* AND assayType: RNA-seq AND subjectCount >= 1000

例3: 制限なしで使える高深度 WGS
-> criteria: Unrestricted-access AND sequencingDepth >= 30 AND assayType: WGS

例4: 表現型データ付きの糖尿病研究
-> diseases: *diabetes* AND hasPhenotypeData: true
```

### Bulk 取得（`GET /dataset/batch`, `GET /research/batch`）

一覧で選んだ複数件の詳細をまとめて取得するための読み取りエンドポイント。`ids` クエリパラメータにカンマ区切りで ID を渡す。

- `GET /dataset/batch?ids=JGAD000001,JGAD000002` — datasetId の配列
- `GET /research/batch?ids=hum0001,hum0002` — humId の配列

| 観点 | 挙動 |
|------|------|
| バージョン | 各 ID の **最新版** を返す（特定バージョンは詳細エンドポイントを使う） |
| 部分成功 | 取得できたものを **入力順（重複排除後）** で `data` に返す。取得できなかった ID は `meta.batch.notFound` に列挙し、`data` には含めない |
| 存在しない ID とアクセス不可 ID | **区別せず** `notFound` に集約する（アクセスできないリソースの存在を秘匿するため） |
| 認可 | ID ごとに詳細取得と同じ可視性ルールを適用（research は非 owner に値ベース制御で published view を返す） |
| 上限 | 1 リクエストあたり最大 100 ID。空の `ids` は 400 |
| レスポンス item | 詳細エンドポイントと同じシェイプ（dataset は `mergedSearchable` 付き）。楽観的ロック値（`_seq_no` / `_primary_term`）は **含めない**（一覧と同思想、編集時は詳細を再取得する） |

`meta.batch` は `{ requested, found, notFound }`。`requested` は重複排除後の総数、`found` は取得数、`notFound` は欠落 ID 配列。ページネーションは行わず指定 ID を一括返却するため、`max_result_window` の罠（§7）とは無関係。

### 関連 OpenAPI 参照

- tag: `Search`
- operationId: `searchResearch`, `searchDataset`, `getFacets`, `getFacet`
- Bulk 取得: operationId `batchGetDatasets`（tag `Dataset`）, `batchGetResearch`（tag `Research`）

---

## 9. UI ユースケース別呼び出しシーケンス

OpenAPI 単体では表現できない「複数 API の連鎖」のための章。個別 API の仕様は OpenAPI を参照。

### 新規 Research 作成

```text
[admin]
1. POST /research/new (createResearch)
   - humId 未指定なら自動採番 (hum0001, hum0002, ...)
   - status=draft で作成。uids に編集者を指定可能
```

### Draft 保存（Research + 複数 Dataset を同時編集）

```text
1. PUT /research/{humId}/update (updateResearch)
   - Research のメタデータを更新（リクエストボディに `_seq_no` と `_primary_term` を含める）

2. 新規 Dataset:
   POST /research/{humId}/dataset/new (createResearchDataset) -- Dataset ごと

3. 既存 Dataset 更新:
   PUT /dataset/{datasetId}/update (updateDataset) -- Dataset ごと（`_seq_no` / `_primary_term` を含める）
```

各 API は順次呼び出す。途中失敗はクライアント側で復旧する。

### レビュー提出と承認

```text
[authenticated, owner]
1. POST /research/{humId}/submit (submitResearch)
   - draft -> review

[admin]
2. GET /research?status=review (listResearch)
3. GET /research/{humId} (getResearch)
4a. POST /research/{humId}/approve (approveResearch)
    - review -> published, Dataset version 確定
4b. POST /research/{humId}/reject (rejectResearch)
    - review -> draft
```

### 公開済み Research の更新（新バージョン）

```text
1. POST /research/{humId}/versions/new (createResearchVersion)
   - published の Research のみ。latestVersion は維持、draftVersion に新 version
2. (Draft 保存と同じ流れで編集・保存)
3. submitResearch -> approveResearch で新 version を公開
```

### Research 削除

```text
[admin]
1. POST /research/{humId}/delete (deleteResearch)
   - 物理削除: Research, 全 ResearchVersion, 全紐づき Dataset を削除
   - 削除後は同じ humId で再作成可能
```

### 関連 OpenAPI 参照

- tag: `Research`, `Research Datasets`, `Research Status`, `Dataset`
- operationId: 上記シーケンス内で列挙

---

## 10. エラーハンドリング

全エラーレスポンスは **RFC 7807 Problem Details** (`Content-Type: application/problem+json`) で返る。レスポンス schema・各 status の detail 例は OpenAPI の各 operation の `responses` を参照。

### X-Request-ID との突き合わせ

- 全リクエストに `X-Request-ID` ヘッダーが付与される
- エラーレスポンス body の `requestId` フィールドは同じ値
- サーバーログ（structured JSON）の `requestId` フィールドと突き合わせて、エラー発生時のサーバー側挙動を辿る

### エラーコード一覧

エラータイプ enum・フィールド説明は [architecture.md § エラーレスポンス](architecture.md#エラーレスポンス) を SSOT とする。OpenAPI components の `ProblemDetailsSchema` も同期している。

### 関連 OpenAPI 参照

- components.schemas: `ProblemDetails`
- 全 operation の 4xx/5xx response: `application/problem+json`

---

## 11. Stats API

`GET /stats` (`getStats`) でダッシュボード用の集計情報を取得する。

### 集計対象

**published なリソースのみ**。draft / review は除外。これは「Stats は外部公開可能な統計」という前提による。

### レスポンス構造

- Research / Dataset の総件数
- 主要なファセットフィールドの値ごとに、Research 件数と Dataset 件数

詳細な schema は OpenAPI の `StatsResponseSchema` を参照。

### 関連 OpenAPI 参照

- tag: `Stats`
- operationId: `getStats`

---

## 12. rawHtml の扱い

`BilingualTextValue` 型のフィールド (`summary.aims` / `methods` / `targets`、`Person.name` / `organization.name`、`Experiment.header` / `data.*`、`releaseNote` 等) は内部的に **`text` (正規化済みプレーンテキスト) と `rawHtml` (元の HTML)** の 2 つを保持する。crawler が Joomla / TSV から取り込む際に `rawHtml` を残すことで、後段の表示で書式（リンク・改行・装飾）を復元できる。

```jsonc
// API レスポンスでは BilingualTextValue は次の形:
{
  "ja": { "text": "プレーンテキスト", "rawHtml": "<p>プレーンテキスト</p>" },
  "en": { "text": "Plain text",       "rawHtml": "<p>Plain text</p>" }
}
```

### Request では `rawHtml` を送らない

POST/PUT のリクエストボディは `BilingualTextValueRequestSchema` (`apps/backend/src/api/types/request-schemas.ts`) を使い、`rawHtml` フィールドを **schema レベルで剥がしてある**。クライアントは `{ ja: { text }, en: { text } }` だけを送れば良い。`rawHtml` を載せて送ると Zod 検証で 400 になる。

サーバー側は `apps/backend/src/api/utils/hydrate-raw-html.ts` の hydrator が ES 書き込み前に `rawHtml: null` を注入し、ES schema (`BilingualTextValueSchema`) を満たす形に揃える。**「API 経由で作成・更新したレコードの `rawHtml` は常に `null`」** の不変条件はここから来る。crawler 由来のレコードのみ `rawHtml` に元 HTML を保持する。

### Response の default は `text` のみ (`includeRawHtml=false`)

GET / list / search 系の query parameter `includeRawHtml` (default `false`) で response から `rawHtml` を剥がす:

```bash
GET /api/research/hum0001                  # includeRawHtml=false (default) → rawHtml 抜き
GET /api/research/hum0001?includeRawHtml=true   # rawHtml 同梱
```

剥がし処理は `apps/backend/src/api/utils/strip-raw-html.ts` の `maybeStripRawHtml` が再帰的に行う。

理由:

- 通常の表示用途（プレーンテキスト・最小ペイロード）では `rawHtml` は不要
- リッチテキストエディタで「元の書式を維持して再編集」する場合のみ `includeRawHtml=true` を使う
- POST/PUT 直後のレスポンスにも同じ規則が適用されるが、API 経由で作成したレコードは `rawHtml: null` なので `includeRawHtml=true` でも `null` のままなのだ

### OpenAPI examples の `bilingualText` / `bilingualTextRequest` ヘルパ

`apps/backend/src/api/openapi/examples.ts` には 2 つのヘルパがある:

| ヘルパ | 形 | 用途 |
|---|---|---|
| `bilingualText(ja, en)` | `{ ja: { text, rawHtml: null }, en: { text, rawHtml: null } }` | response example (rawHtml 同梱想定 = `includeRawHtml=true` 相当の shape。`rawHtml` は `null`) |
| `bilingualTextRequest(ja, en)` | `{ ja: { text }, en: { text } }` | request body example (`rawHtml` 抜き) |

response example の `rawHtml` を `null` で固定しているのは、API 経由で作成したレコードの不変条件と一致させるため。crawler 由来のレコードを取得した場合は `rawHtml` に HTML 文字列が入る。

### 関連 OpenAPI 参照

- query parameter: `includeRawHtml` (`LangVersionQuerySchema`, `LangQuerySchema`, search query schemas)
- 影響を受ける components.schemas: `BilingualTextValue`, `TextValue`

## 13. Template エンドポイント (admin only)

外部 ID (J-DS 申請 ID / JGAD / DRA Submission) を起点に、`POST /research/new` / `POST /research/{humId}/dataset/new` の request body と完全互換な「雛形 JSON」を返す admin 専用エンドポイント。admin はレスポンスを取得 → エディタで編集 → そのまま POST する想定。

### 単位対応

`humandbs` のリソースと外部 DB の単位対応は次の通り:

| humandbs | JGA 系 | DRA / INSDC 系 |
|---|---|---|
| **Research** (`hum0001`) | `JGAS` (Study) ≅ `J-DS` application (1:1) | BioProject (humandbs ↔ JGA → BP 経由) |
| **Dataset** (`JGAD000001`) | `JGAD` (1:1) | DRA Submission (`DRA000xxx`) (1:1) |
| **Experiment (1 row)** | (公開 metadata なし) | DRX (DRA input 時のみ。1 DRX = 1 row、DRS → BioSample で sample attrs enrich) |

### `GET /templates/research/{jdsId}`

`jdsId` (例: `J-DS002527`) から `CreateResearchRequest` 互換の Research 雛形を返す。

- `humId`: `jds.humIds[0]` を suggested として詰める (空ならフィールド省略)。`humId` が既に Research として存在するかどうかはここでは検査しない (admin が POST した時点で 409 が返り、その場で humId を編集すればよい)
- `summary.aims` / `methods` / `targets`: `jds.aim` / `method` / `participant` を `BilingualTextValueRequest` で詰める
- `dataProvider[0]`: J-DS の PI を `Person` に整形:
  - 氏名は `last first` (ja) / `first last` (en) で連結
  - `organization.name` は institution と division を `" / "` で連結 (`"University of Tokyo / Department of Computational Biology"` のような形)。institution・division いずれかが空ならもう一方だけを使う
  - 住所は国コードのみ (request schema が国コードしか受けないため)
- `dataProvider[1+]`: J-DS の `submitter` が PI と別人とみなせる場合のみ追加する。判定は (1) accountId が両方非 null で異なる、または (2) accountId が片方/両方 null のときは en/ja 氏名が異なる、のいずれか。両方とも空名・空 accountId のときは "区別できない" として追加しない
- `relatedPublication`: 以下を順に詰める。いずれも `title.ja` と `title.en` に同じ文字列を入れる (元データが言語非依存の citation / identifier であり、frontend の locale 切替で空欄にしないため):
  - `jds.publication` (free-text、`null` / whitespace なら省略) を `{ title: { ja: pubText, en: pubText } }` として詰める
  - 各 JGAS (`jds.jgaIds[]` から `^JGAS\d+$` で filter) について DDBJ Search の `/dblink/jga-study/{jgas}` を叩き、`pubmed` type の identifier を `{ title: { ja: "PubMed: {id}", en: "PubMed: {id}" } }` として追加。複数 JGAS 間で de-dup する
- `relatedAccessions.jgad`: `jds.jgaIds[]` を `^JGAD\d+$` で filter したリスト。後段で `GET /templates/dataset/{externalId}` を叩く際の入力源
- `warnings[]`: 非致命的な注意事項。JGAS → pubmed dblink の取得失敗時に `"JGAS000002: dblink to pubmed failed (...)"` の形で記録する。それ以外は空配列
- 422: `jdsId` が `^J-DS\d+$` に合致しない
- 404: J-DS が JGA-Shinsei DB に存在しない (内部で `getDsApplication` が `NotFoundError` を投げる)
- 500: JGA-Shinsei DB 接続失敗 / 内部エラー (5xx 系は INTERNAL_ERROR に統一)

J-DS の `restriction` / `icd10` / `collaborators[]` / `head` は雛形に直接マッピングしない (humandbs 側に対応スロットがないか、collaborators[] は実 J-DS で空である割合が高く、head は organization head = 署名権者で data provider と意味が異なるため)。`pi.job` / `pi.phone` / `pi.address.{prefecture,city,street,postalCode}` は `PersonRequestSchema` に対応フィールドが無いため雛形に乗らない (schema 拡張時に追加検討)。

### `GET /templates/dataset/{externalId}`

`externalId` (`JGAD000001` または `DRA000001`) から `CreateDatasetForResearchRequest` 互換の Dataset 雛形を返す。

許容 prefix は **`JGAD` または `DRA`** のみ。`JGAS` / `JGAN` / `JGAX` / `JGAR` / `DRP` / `DRX` / `DRS` / `DRR` / `PRJDB` / `SAMD` は 422 を返す (Dataset の単位を曖昧化させないため)。

**JGAD input の場合**:

- `criteria = "Controlled-access (Type II)"` (default)
- `typeOfData.en = JGAD.TITLE` (なければ `DATASET_TYPE` を `, ` で join)
- `releaseDate = JGAD.datePublished` (`YYYY-MM-DD`)
- `experiments = []` (JGA の公開 metadata に DRX 相当の sample 情報がないため、admin が手で埋める)
- **cache 挙動**: template ルートは crawler 側のローカル `jgad/` cache をバイパスし、DDBJ Search の `entries/jga-dataset/_doc/{jgadId}` を都度 fetch する (`getJgadEntry`)。雛形の起点となる admin → POST → 公開の流れで古いキャッシュが混入しないようにするため。`properties` と `datePublished` は 1 リクエストで一括取得する

**DRA Submission input の場合**:

- 内部 traversal: `DRA submission → DRP study → DRX 群 → 各 DRX について DRR / DRS / BioSample`
  - DRP は最初の 1 件を `/entries/sra-study/{drp}` で取得し、`title` を typeOfData の fallback に使う
  - 各 DRX については `/entries/sra-experiment/{drx}`、`/dblink/sra-experiment/{drx}`、最初の `/entries/sra-run/{drr}` を取得し、DRS / BioSample IDs は dblink の `dbXrefs[]` を type で分けて抜き出す
- `criteria = "Unrestricted-access"`
- `typeOfData.en` の fallback chain: `DRP study title > submission.title (ただし accession ID と一致する場合は除外) > submission.description > submission.title`。多くの submission は title === 自身の accession ("DRA000001") になっていて雛形として情報量が低いため、DRP の `STUDY_TITLE` を優先する
- `experiments[]`: **1 DRX = 1 experiment row**。`header = { ja: DRX, en: DRX }`、`data` に以下を平らに展開:
  - 標準 EXPERIMENT 情報: `Title` / `Description` / `Library Strategy` / `Library Source` / `Library Selection` / `Library Layout` / `Library Name` / `Library Construction Protocol` / `Platform` / `Instrument Model`
  - DRX の深い properties から: `Nominal Insert Size` (PAIRED.NOMINAL_LENGTH) / `Nominal Insert SDEV` / `Spot Length` (SPOT_DESCRIPTOR.SPOT_LENGTH) / `Center Name` (experiment.center_name)
  - DRR から: `Run Accessions` (id 列挙) / `Run Date` / `Run Center` (最初の DRR の properties.RUN.run_date / run_center)
  - DRS / BioSample から: `Sample Accession` / `BioSample` / `Organism` (DRS の organism.name + taxonomy_id) + BioSample attributes (`harmonized_name` / `attribute_name` をキーにそのまま展開、snake_case 維持)
- `experiments[].searchable`: DRX から **機械抽出できる項目だけ** 埋める:
  - `assayType` = libraryStrategy
  - `platforms` = platform (vendor) と instrumentModel (model) の組
  - `readType` = libraryLayout (`PAIRED` → `paired-end` / `SINGLE` → `single-end`)
  - `readLength` = SPOT_LENGTH から計算 (paired-end の場合は `SPOT_LENGTH / 2`、single-end の場合は SPOT_LENGTH そのまま。layout 不明 or SPOT_LENGTH 不在のときは null)
  - その他 (`subjectCount` / `diseases` / `tissues` / `healthStatus` 等) は不安定なので default (`null` / `[]`) のまま admin / 後段 LLM 抽出に委ねる
- DDBJ Search API への並列 fetch は同時 5 並列まで (常時 5 worker、終わったら順次次の DRX を補充するセマフォ式)
- 部分失敗 (DRP / DRX / DRR / DRS / BioSample 取得失敗) は `warnings[]` に `"DRX000003: fetch failed (...)"` または `"DRX000003 DRS DRS000123: fetch failed (...)"`、`"DRX000003 DRR DRR000456: fetch failed (...)"`、`"DRP000007: sra-study fetch failed (...)"` の形で記録し、取れた分は返す
- 404: 入力 submission 自体が DDBJ Search API で見つからない
- 500: 入力 submission の取得が 5xx / network error (5xx 系は INTERNAL_ERROR に統一)
- **cache 挙動**: `api/external/ddbj-search/` 配下の client はキャッシュを持たず、すべての fetch が DDBJ Search への都度リクエストになる

#### `experiments[].searchable` を request 側でも受け入れる拡張

Template 導入と合わせて、`POST /research/{humId}/dataset/new` および `PUT /dataset/{datasetId}/update` の body にある `experiments[]` の各要素が `searchable: SearchableExperimentFields` を **optional** で受け取れるようになった (拡張前は受け付けなかった)。

意図: Template の `experiments[].searchable` を frontend がそのまま編集して POST/PUT で送り返せるようにするため。`searchable` を指定した experiment はその値が ES にそのまま書き込まれる。未指定の experiment は ES 上 `searchable` が `undefined` のまま (= 従来挙動と互換、後段 LLM 抽出 step が走れば上書きされる)。

現状フロントエンド側に `searchable` 編集 UI はまだ無く (`apps/frontend/src` で `searchable` 文字列はゼロヒット、編集フォーム `DatasetForm.tsx` も `header` / `data` のみ扱う)、編集 UI 追加は別タスクで対応する想定。サーバー側スキーマはそれを受け入れる準備が済んでいる、という状態。

### 雛形 → POST のワークフロー

```bash
# 1. Research 雛形を取得
GET /templates/research/J-DS002527
#    -> { humId, title, summary, dataProvider, ..., relatedAccessions: { jgad: ["JGAD000001"] } }

# 2. Research を作成
POST /research/new   # ← step 1 のレスポンス data から `relatedAccessions` / `warnings` を除いて投げる

# 3. 関連 Dataset の雛形を取得
GET /templates/dataset/JGAD000001
GET /templates/dataset/DRA000001       # JGAD と DRA が混在する場合は両方取れる

# 4. Dataset を作成 (Research のオーナーまたは admin)
POST /research/{humId}/dataset/new     # ← step 3 のレスポンス data から `warnings` を除いて投げる
```

`relatedAccessions` / `warnings` は POST 側のスキーマに存在しないが、Zod の default (`strip`) で黙って破棄されるので、剥がさずに送っても 400 にはならない。とはいえペイロードを清潔に保つため、クライアント側で除去してから POST するのが望ましい。

### 関連 OpenAPI 参照

- operationId: `getResearchTemplate`, `getDatasetTemplate`
- components.schemas: `ResearchTemplateData`, `DatasetTemplateData`, `TemplateRelatedAccessions`
- 出力本体: `CreateResearchRequest` / `CreateDatasetForResearchRequest` (extend で `relatedAccessions` / `warnings` を追加した形)

---

## 10. Distribution（データダウンロードリンク）

Dataset detail / version detail エンドポイントのレスポンスに、公開データのダウンロードリンクを `distribution` フィールドとして含める。ES には保存せず、レスポンス構築時に動的生成する。

### 対象

公開データのみ。JGAD（制限アクセス）や BioProject（参照 ID）は対象外で、空配列が返る。

| 種類 | ID パターン | URL 構築方法 |
|---|---|---|
| GEA | `E-GEAD-{N}` | accession から静的に構築 |
| MetaboBank | `MTBKS{N}` | accession から静的に構築 |
| DRA | `DRA{6桁}` | ddbj-search-api の dblink API で experiment/run を動的取得し、FASTQ ディレクトリ + SRA ファイルの URL を構築 |
| NBDC Dataset | `hum{N}.v{N}...` | サーバーの files ディレクトリを readdir して該当ファイルを列挙 |

### レスポンス形状

```json
{
  "distribution": [
    {
      "url": "https://ddbj.nig.ac.jp/public/ddbj_database/gea/experiment/E-GEAD-1000/E-GEAD-1051/",
      "name": "E-GEAD-1051 data dir",
      "type": "directory"
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `url` | string | ダウンロード URL |
| `name` | string | 人間向けラベル（例: `DRX003058 fastq dir`, `DRR003760.sra`） |
| `type` | `"directory"` \| `"file"` | ディレクトリ一覧かファイル直リンクか |

### エラー時の挙動

distribution の取得に失敗しても dataset 本体のレスポンスは正常に返る（`distribution` は空配列になる）。

### 関連 OpenAPI 参照

- operationId: `getDataset`, `getDatasetVersion`
