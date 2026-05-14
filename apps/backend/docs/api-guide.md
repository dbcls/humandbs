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
| `published` | 直接編集不可 | 公開（`latestVersion`） | `unpublish` → `draft` / `createResearchVersion` → 新 draft version |
| `deleted` | 不可 | 不可 | （論理削除、復元不可） |

### published 中の編集

published 状態の Research を直接編集するエンドポイントは存在しない。`createResearchVersion` で新 draft version を起こし、`latestVersion` は維持したまま `draftVersion` で編集する。再度 `submit` → `approve` で publish。

### Dataset の編集制約

Dataset の create/update/delete は **親 Research が `draft` のときのみ** 許可される。`review` / `published` 中の Dataset 編集は 403/409 を返す。

### 関連 OpenAPI 参照

- tag: `Research Status`
- operationId: `submitResearch`, `approveResearch`, `rejectResearch`, `unpublishResearch`

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

構造を分けている理由: Research 検索は内部で「Dataset を引いて親 Research をヒットさせる」処理を含むため、Research 自身の属性と Dataset 属性をクエリビルダ上で明確に分離する必要があるため。

### フリーテキスト検索の挙動

`query` パラメータは本文フィールドと ID フィールドを横断検索する。

| 入力例 | ヒット経路 |
|---|---|
| `hum0001` | `humId` の完全一致 |
| `hum000` | `humId` の前方一致 |
| `JGAD000002` | Dataset index を引き、親 `humId` 経由で Research をヒット |
| `cancer` | 本文（`title`, `summary.aims.text`, etc.）の全文検索 |
| `hum0001 cancer` | ID 節は完全一致しないので空振り、本文側で `cancer` がヒット |

ID マッチは大文字小文字を区別しない。完全一致は `boost` でスコア最上位に並ぶ。

検索対象フィールド:

- **Research**: `title`, `summary.aims.text`, `summary.methods.text`, `summary.targets.text` (本文) / `humId` (ID) / `datasetId` 経由
- **Dataset**: `typeOfData`, `experiments.searchable.targets` (本文) / `humId`, `datasetId` (ID)

### 全文検索の fuzziness

全文検索（`multi_match`）には Elasticsearch の `fuzziness: "AUTO:5,12"` を設定:

| トークン長 | 許容 Levenshtein 距離 |
|---|---|
| 0-4 文字 | 0（完全一致）|
| 5-11 文字 | 1（1 文字までの typo を許容）|
| 12 文字以上 | 2（2 文字までの typo を許容）|

「英語自然語の typo 許容」と「長い ID 文字列（例: `JGAD000002` 10 文字）が他の類似 ID と誤マッチしないこと」を両立する設定。日本語本文は standard analyzer により CJK 1 文字単位に分割されるため、この設定の影響は実質的に受けない。ID 側（`humId` / `datasetId`）は term / prefix マッチで完全一致経路を張っているため fuzziness の影響を受けない。

### sort / order の default

`sort` / `order` 未指定時の動作:

| 入力 | sort default | order default |
|---|---|---|
| `query` 指定あり | `relevance` | `desc` |
| `query` 指定なし | `humId`（Research） / `datasetId`（Dataset） | `asc` |

指定可能な `sort` の enum 値は OpenAPI の各 schema を参照。

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

### 関連 OpenAPI 参照

- tag: `Search`
- operationId: `searchResearch`, `searchDataset`, `getFacets`, `getFacet`

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
   - status=deleted（論理削除）。紐づく Dataset は物理削除
```

deleted Research へのアクセス挙動:

- `status === "deleted"` の Research は **admin 以外（owner を含む）には 404** を返す
- 対象 API: `getResearch`, `listResearch`, `listResearchVersions`, `getResearchVersion`, `searchResearch`, `getDataset`（親が deleted なら 404）, `listDatasetVersions`
- 検索／一覧 API では完全に除外（`data[]` に含まれず、ファセット件数にも反映されない）
- 詳細は [architecture.md § deleted 状態](architecture.md#deleted-状態)

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

**published なリソースのみ**。draft / review / deleted は除外。これは「Stats は外部公開可能な統計」という前提による。

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
