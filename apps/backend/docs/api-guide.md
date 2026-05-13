# API ガイド

HumanDBs Backend の REST API の使い方。エンドポイントの一覧・リクエスト/レスポンス形式は Swagger UI を参照。本ドキュメントは「Swagger だけでは伝わらない使い方・運用ルール」をまとめる。

## OpenAPI ドキュメント

インタラクティブな API ドキュメント (Swagger UI):

| 環境 | URL |
|------|-----|
| Staging | <https://humandbs-staging.ddbj.nig.ac.jp/api/docs> |
| Production | <https://humandbs.dbcls.jp/api/docs> |

## エンドポイント構成

エンドポイント一覧と各々のリクエスト/レスポンス schema は Swagger UI を参照。本ガイドは以下の括りで「使い方」を説明する。

| 括り | パス例 | 主要な使い方の説明先 |
|---|---|---|
| Research CRUD・lifecycle | `/research`, `/research/{humId}/*`, `/research/{humId}/submit\|approve\|reject\|unpublish` | [§ ワークフロー](#ワークフロー)、[§ UI ユースケースと API 呼び出しパターン](#ui-ユースケースと-api-呼び出しパターン) |
| Dataset CRUD | `/dataset`, `/dataset/{datasetId}/*`, `/research/{humId}/dataset/new` | [§ Create Dataset for Research の初期化挙動](#create-dataset-for-research-の初期化挙動)、[§ PUT /dataset/{datasetId}/update のバージョン bump 挙動](#put-datasetdatasetidupdate-のバージョン-bump-挙動) |
| 検索・ファセット | `/research/search`, `/dataset/search`, `/facets`, `/facets/{fieldName}` | [§ 検索の使い方](#検索の使い方) |
| JGA 申請 (read-only, admin) | `/jga-shinsei/ds`, `/jga-shinsei/du`, `/jga-shinsei/{ds,du}/{id}` | 認可は admin 固定。リクエストごとに PostgreSQL を直接クエリし、レスポンスを組み立てる ([apps/backend/jga-shinsei/README.md](../jga-shinsei/README.md)) |
| Stats | `/stats` | [§ Stats API](#stats-api)。published のみ集計 |
| Admin / Health | `/admin/is-admin`, `/health` | `/admin/is-admin` は認証必須、`/health` は public |

認可レベル別の操作可否は [§ 認可モデル](#認可モデル) と [architecture.md § 認可マトリクス](architecture.md#認可マトリクス) を参照。

## 共通仕様

### 言語パラメータ

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `lang` | `"ja"` \| `"en"` | `"ja"` | レスポンスの言語を指定 |

### 一覧レスポンスの多言語フィールド

Research 一覧 (`GET /research`) のレスポンスでは、`title` フィールドが BilingualText 形式で返される。これにより、個別 API を叩かずに各言語の翻訳有無を判定できる。

```json
{
  "humId": "hum0001",
  "lang": "ja",
  "title": { "ja": "SCA31罹患患者のゲノム解析データ", "en": "Sequence Data of a SCA31 Patient" },
  "methods": "方法テキスト（lang で指定した言語）",
  ...
}
```

- `title.en` が `null` の場合、英語版が未作成であることを示す
- `methods`, `targets` 等の他テキストフィールドは従来通り `lang` パラメータで指定した言語のフラットな文字列を返す
- 認証ユーザーのレスポンスには `status` フィールド（`draft`, `review`, `published`, `deleted`）が含まれる。public ユーザーには含まれない

### rawHtml の扱い

#### `includeRawHtml` クエリパラメータ

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `includeRawHtml` | boolean | `false` | rawHtml フィールドを含めるか |

編集画面で元の HTML を表示・編集したい場合に `includeRawHtml=true` を指定する。

#### Create / Update リクエストでの扱い

`POST /research/new`, `PUT /research/{humId}/update`, `POST /research/{humId}/dataset/new`, `PUT /dataset/{datasetId}/update`, `POST /research/{humId}/versions/new` の request schema は `rawHtml` を**含まない**。`TextValue` 系フィールド (`title`, `summary.aims`, `summary.methods`, `summary.targets`, `dataProvider.name`, `relatedPublication.*`, `grant.title`, `releaseNote`, `experiments.header`, `experiments.data` 等) は `{ text: string }` のみを受け取る。

- `rawHtml` は crawler が HTML をパースして保持する生 HTML で、クライアントから送るフィールドではない
- クライアントが `rawHtml` を含む payload を送った場合は zod の strip 挙動で破棄される（400 にはしない）
- 新規作成レコードは `rawHtml: null` で ES に保存され、GET で null として返る
- Update 時、リクエストに `rawHtml` が含まれないため、ES の既存 `rawHtml` は null で上書きされる

### Create Dataset for Research の初期化挙動

`POST /research/{humId}/dataset/new` は Draft Research 配下に最小 Dataset を生やすエンドポイントで、frontend の form 初期化（新規 Dataset / experiment を追加するボタン押下時）での利用を想定している。他の Create/Update と異なり、body の全フィールドが optional で、省略時はサーバー側の default が適用される。

| フィールド | 省略時の default |
|---|---|
| `datasetId` | `DRAFT-{humId}-{uuid}` |
| `releaseDate` | 現在日付（ISO 8601）|
| `criteria` | `Controlled-access (Type I)` |
| `typeOfData` | `{ ja: null, en: null }` |
| `experiments` | `[]` |
| `experiments[].header` | `{ ja: null, en: null }` |
| `experiments[].data` | `{}` |

なお `PUT /dataset/{datasetId}/update` は「全置換」セマンティクスで、`experiments[].header` / `experiments[].data` は **required** のまま（省略による意図せぬ空置換を防ぐため）。

### ページネーション

オフセットベースのページネーションを採用。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `page` | integer | `1` | ページ番号 (1始まり) |
| `limit` | integer | `20` | 1ページあたりの件数 (最大100) |

`limit` に 101 以上を指定した場合は `400 Bad Request` を返す。

#### 深いページの上限 (`max_result_window`)

Elasticsearch の `index.max_result_window` (デフォルト 10000) を超える深さのページネーション (`(page - 1) * limit + limit > 10000`) はエラーではなく **空ページ**として返る:

```json
{ "data": [], "pagination": { "page": 1001, "limit": 20, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false } }
```

`total` も `0` で返る点に注意（「該当 0 件」と区別がつかない）。クライアント側ではこの上限を意識した UI 制御が必要。対象 API: `GET /research`, `GET /dataset`, `POST /research/search`, `POST /dataset/search`。

### バージョン指定

バージョンはパスパラメータで指定する:

```plaintext
GET /research/{humId}/versions/v1
GET /dataset/{datasetId}/versions/v1
```

`GET /research/{humId}` や `GET /dataset/{datasetId}` はデフォルトで最新バージョンを返す。`?version=v1` のようにクエリパラメータで特定バージョンを指定することも可能。

## 認可モデル

3 段階の認可レベルがある。詳細は [architecture.md](architecture.md#認証認可) を参照。

| レベル | 説明 | アクセス範囲 |
|--------|------|-------------|
| **public** | 認証なし | [公開条件](architecture.md#公開条件)を満たすリソースのみ（詳細は[公開判定](architecture.md#公開判定public-visibility)を参照） |
| **authenticated** | 認証あり | public + 自分が `uids` に含まれる Research とその Dataset |
| **admin** | 認証あり + admin リスト | 全リソースアクセス可能、lifecycle 操作可能 |

## ワークフロー

Research のライフサイクル: `draft → review → published`。詳細は [architecture.md](architecture.md#状態遷移ワークフロー) を参照。

- **draft**: 編集可能。Dataset の作成・更新・削除が可能。`draftVersion` に編集中バージョンを保持
- **review**: 編集不可。admin が承認または却下する
- **published**: 公開。`latestVersion` に公開バージョン、`draftVersion` は null。変更するには新バージョンを作成する
- **新バージョン作成**: published 状態の Research に対してのみ可能。`latestVersion` は維持され、`draftVersion` に新バージョンが設定される。public ユーザーは引き続き `latestVersion` を閲覧可能

## 楽観的ロックの使い方

更新系 API では楽観的ロックで同時編集の競合を検出する。仕組みの詳細は [architecture.md](architecture.md#楽観的ロック) を参照。

### Frontend での実装

1. **GET** でリソースを取得 → `meta._seq_no` と `meta._primary_term` を保持
2. ユーザーが編集
3. **PUT** で更新リクエスト → リクエストボディに `_seq_no` と `_primary_term` を含める
4. 成功: 新しい `_seq_no` と `_primary_term` がレスポンスに含まれる
5. **409 Conflict**: 他のユーザーが先に更新した

### 409 Conflict が返ったときの対応

1. **再取得して通知**: 最新データを取得し直し、「他のユーザーが更新しました」とユーザーに通知する
2. **自動リトライ**: 最新データを取得し、ユーザーの変更を再適用して再送信する (マージロジックが必要)

## エラーレスポンス

RFC 7807 Problem Details 形式。全リクエストに `X-Request-ID` ヘッダーが付与され、エラーレスポンス body の `requestId` フィールドと一致する。サーバーログとの突き合わせに使用する。

エラータイプ一覧・フィールド説明は [architecture.md § エラーレスポンス](architecture.md#エラーレスポンス) を参照。

## UI ユースケースと API 呼び出しパターン

フロントエンド実装時の参考として、主要なユースケースごとの API 呼び出しパターンを示す。

### 新規 Research 作成

```plaintext
1. POST /research/new
   -> humId を指定する場合はリクエストボディに含める
   -> 指定しない場合は自動採番 (hum0001, hum0002, ...)
   -> status=draft で作成される
```

### Research 編集画面で Draft 保存

Research の情報と複数の Dataset を同時に編集し、「Draft として保存」ボタンを押す場合:

```plaintext
1. PUT /research/{humId}/update
   -> Research のメタデータを更新

2. 新規 Dataset がある場合:
   POST /research/{humId}/dataset/new (Dataset ごとに)

3. 既存 Dataset の更新がある場合:
   PUT /dataset/{datasetId}/update (Dataset ごとに)
```

各 API は順次呼び出す。途中でエラーが発生した場合、フロントエンドでエラーハンドリングを行う。

#### `PUT /dataset/{datasetId}/update` のバージョン bump 挙動

publish 済みの Research の draft cycle 中に初めて Dataset を更新すると、サーバー側で `vN` → `v(N+1)` に自動 bump される（[architecture.md § 「初回更新」の判定](architecture.md#初回更新の判定)）:

- URL に `?version=` 未指定の場合、middleware が最新版に解決する（[architecture.md § Dataset のバージョン解決](architecture.md#dataset-のバージョン解決)）
- レスポンスの `data.version` は **URL で指定した version とは異なる場合がある**（bump 後の新 version が返る）
- クライアントは「PUT の戻り値の `data.version` と `meta._seq_no` で次の編集を行う」前提で実装する

### レビュー提出と承認

```plaintext
[authenticated]
1. POST /research/{humId}/submit
   -> status が draft -> review に変更

[admin]
2. GET /research?status=review
   -> レビュー待ちの Research 一覧を取得

3. GET /research/{humId}
   -> 詳細を確認

4a. POST /research/{humId}/approve
    -> status が review -> published に変更
    -> この時点で Dataset の version が確定

4b. POST /research/{humId}/reject
    -> status が review -> draft に戻る
```

### 公開済み Research の更新 (新バージョン作成)

```plaintext
1. POST /research/{humId}/versions/new
   -> Research が published 状態の場合のみ可能 (draft/review では 409 Conflict)
   -> latestVersion は維持 (public は引き続き公開版を閲覧可能)
   -> draftVersion に新バージョンが設定される
   -> status が draft に変更

2. (Draft 保存と同様に編集・保存)

3. POST /research/{humId}/submit -> approve
   -> latestVersion が draftVersion に更新、draftVersion が null に
   -> 新 version が公開される
```

### Research 削除

```plaintext
1. POST /research/{humId}/delete
   -> status が deleted に変更 (論理削除)
   -> 紐づく Dataset は自動的に物理削除される
```

削除後のアクセス挙動（後方互換の注意）:

- `status === "deleted"` の Research は **admin 以外（owner を含む）には 404** を返す
- 対象 API: `GET /research`, `GET /research/{humId}`, `GET /research/{humId}/versions`, `GET /research/{humId}/versions/{v}`, `POST /research/search`, `GET /dataset/{datasetId}`（親 Research が deleted なら 404）, `GET /dataset/{datasetId}/versions`
- 検索／一覧 API では完全に除外される（`data[]` に含まれない、ファセット件数にも反映されない）
- 詳細は [architecture.md § deleted 状態](architecture.md#deleted-状態) を参照

## 検索の使い方

### 検索フロー

1. フロントエンドは `GET /facets` でファセット値 (件数付き) を取得
2. ユーザーがファセット値を選択
3. `POST /research/search` or `POST /dataset/search` で検索
4. `includeFacets=true` でフィルタ後のファセット件数も取得

`GET /facets` と `GET /facets/{fieldName}` はデータセットフィルタのクエリパラメータを受け付ける。パラメータを指定すると、マッチする Dataset に絞った件数が返る。パラメータ未指定ならグローバルカウント。`fieldName` は `src/api/types/facets.ts` の `DATASET_FACET_NAMES` で定義された名前のみ有効 (不正な名前は 400 エラー)。

ファセット値は認証状態により変わる。public ユーザーには published な Research に紐づく Dataset のファセットのみ返却される。

### 並び順 (sort / order) の default

`POST /research/search` / `POST /dataset/search` の `sort` / `order` 未指定時の動作:

| 入力 | sort default | order default |
|---|---|---|
| `query` 指定あり | `relevance` | `desc` |
| `query` 指定なし | `humId` (Research) / `datasetId` (Dataset) | `asc` |

指定可能な `sort` の enum 値は Swagger UI を参照。

#### ファセット件数の単位

ファセット値の `count` が「何の件数か」はエンドポイントによって異なる。

| エンドポイント | `count` が数える対象 |
|---|---|
| `POST /research/search` (`includeFacets=true`) | Research 数 (humId cardinality) |
| `POST /dataset/search` (`includeFacets=true`) | Dataset 数 (datasetId cardinality) |
| `GET /facets`, `GET /facets/{fieldName}` | クエリパラメータ `countBy` で選択 (`research` = humId, `dataset` = datasetId, デフォルト `dataset`) |

Research 一覧画面のフィルタ UI では `countBy=research` を、Dataset 一覧画面のフィルタ UI では `countBy=dataset` を指定するのが標準的な使い方。同じレスポンス shape で `count` の意味のみ切り替わる。

#### ファセット値の並び順

デフォルトでは件数の降順 (count desc) で返却される。特定フィールドについては `src/api/data/facet-order.json` で優先値リストを定義でき、指定された値が定義順で先頭に並び、残りが件数降順で続く。ES 結果に存在しない定義値は含まれない。

### フィルタの種類

#### ファセット検索 (カテゴリ値)

配列で指定し、OR 条件で動作する。複数フィルタ間は AND。

対象フィールドの完全なリストは `src/api/types/facets.ts § DATASET_FACET_NAMES` を SSOT とする。`criteria`, `assayType`, `tissues`, `population`, `platform`, `disease`, `diseaseIcd10`, `hasPhenotypeData` などを含む。

#### フリーテキスト検索

`query` パラメータは本文フィールドと ID フィールドを横断検索する。検索入力に `humId` (例: `hum0001`) や `datasetId` (例: `JGAD000001`) を渡すと、該当リソースが直接ヒットする。フロント側で入力形式 (ID か本文か) を判定する必要はない。

**Research 検索 (POST /research/search)**

- 全文: `title`, `summary.aims.text`, `summary.methods.text`, `summary.targets.text`
- ID 完全一致 / 前方一致: `humId` (例: `hum0001` で完全一致、`hum000` で前方一致)
- `datasetId` による親 Research ヒット: 内部で Dataset index を引き、`datasetId` に完全一致 / 前方一致する Dataset の親 `humId` を経由して Research をヒットさせる (例: `JGAD000002` を入れると親の `hum0001` が返る)

**Dataset 検索 (POST /dataset/search)**

- 全文: `typeOfData`, `experiments.searchable.targets`
- ID 完全一致 / 前方一致: `humId`, `datasetId` (例: `JGAD000001` で完全一致、`JGAD00` で前方一致)

ID マッチは大文字小文字を区別しない。完全一致は `boost` によりスコア最上位に並ぶ。`hum0001 cancer` のような複合入力では、ID 節は完全一致しないため空振りし、本文側の `cancer` がヒットする。

#### 全文検索の fuzziness

全文検索 (`multi_match`) には Elasticsearch の `fuzziness: "AUTO:5,12"` を設定する。トークン長に応じて許容する Levenshtein 距離 (typo の許容数) が次のように決まる:

| トークン長 | 許容距離 |
|-----------|---------|
| 0-4 文字 | 0 (完全一致) |
| 5-11 文字 | 1 (1 文字までの typo を許容) |
| 12 文字以上 | 2 (2 文字までの typo を許容) |

これは「英語自然語の typo 許容」と「長い ID 文字列 (例: `JGAD000002` 10 文字) が他の類似 ID と誤マッチしないこと」を両立するための設定。日本語本文は standard analyzer により CJK 1 文字単位に分割されるため、この設定の影響は実質的に受けない。ID 側 (`humId` / `datasetId`) は term / prefix マッチで完全一致経路を張っているため fuzziness の影響は受けない。

#### Boolean フィルター

- `hasPhenotypeData`: 表現型データの有無

#### Range フィルター

| フィールド | 対象 |
|-----------|------|
| datePublished, dateModified | Research |
| releaseDate, subjectCount, readLength, sequencingDepth, targetCoverage, dataVolumeGb | Dataset |
| variantSnv, variantIndel, variantCnv, variantSv, variantTotal | Dataset |

#### 疾患検索

- `disease`: ラベルの部分一致 (フリーテキスト)
- `diseaseIcd10`: ICD-10 コードの前方一致 (ファセット選択)

### フィルタの動作

| フィルタ種別 | 動作 | 例 |
|-------------|------|-----|
| 配列フィルタ | OR (いずれかに一致) | `assayType=["WGS","WES"]` → WGS または WES |
| 複数フィルタ間 | AND (全条件を満たす) | `assayType=["WGS"]` + `healthStatus=["affected"]` → 両方を満たす |
| 部分一致 | 文字列の一部を含む | `disease="cancer"` → "lung cancer" にヒット |
| Range | min/max の範囲内 | `subjectCount={min:100}` → 100 以上 |

フィールドの型は `src/crawler/types/structured.ts` の `SearchableExperimentFieldsSchema`、ES mapping は `src/es/dataset-schema.ts` を参照。

### POST 検索ボディのフィルター構造

Research 検索と Dataset 検索ではフィルターのネスト構造が異なる。

**POST /research/search**: Dataset 属性によるフィルターは `datasetFilters` 配下にネストする。Research 自身の属性 (`status`, `datePublished`, `dateModified`) はトップレベルに置く。

```json
{
  "query": "cancer",
  "status": "published",
  "datePublished": { "min": "2020-01-01" },
  "datasetFilters": {
    "assayType": ["WGS"],
    "tissues": ["Blood"]
  }
}
```

**POST /dataset/search**: フィルターは `filters` 配下にネストする。

```json
{
  "query": "cancer",
  "filters": {
    "assayType": ["WGS"],
    "tissues": ["Blood"]
  }
}
```

### 複合検索例

```plaintext
例1: 日本人のがんの WGS で GRCh38 マッピング済み
-> diseases: *cancer* AND population: Japanese AND assayType: WGS AND referenceGenome: *GRCh38*

例2: 血液サンプルの RNA-seq で 1000人以上
-> tissues: *blood* AND assayType: RNA-seq AND subjectCount >= 1000

例3: 制限なしで使える高深度 WGS
-> criteria: Unrestricted-access AND sequencingDepth >= 30 AND assayType: WGS

例4: 表現型データ付きの糖尿病研究
-> diseases: *diabetes* AND hasPhenotypeData: true
```

## Stats API

`GET /stats` で統計情報を取得 (ダッシュボード用)。published なリソースのみを対象とする。

レスポンスには以下が含まれる:

- Research/Dataset の総件数
- 主要なファセットフィールドの値ごとに、Research 件数と Dataset 件数
