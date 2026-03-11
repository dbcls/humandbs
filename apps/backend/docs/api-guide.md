# API ガイド

HumanDBs Backend の REST API の使い方。エンドポイントの詳細 (リクエスト/レスポンス形式) は Swagger UI を参照。

## OpenAPI ドキュメント

インタラクティブな API ドキュメント (Swagger UI):

| 環境 | URL |
|------|-----|
| Staging | <https://humandbs-staging.ddbj.nig.ac.jp/api/docs> |
| Production | <https://humandbs.dbcls.jp/api/docs> |

## エンドポイント一覧

### Research API

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/research` | 一覧取得 | public/authenticated/admin |
| POST | `/research/new` | 新規作成 | admin |
| GET | `/research/{humId}` | 詳細取得 | public/authenticated/admin |
| PUT | `/research/{humId}/update` | 更新 | owner/admin |
| POST | `/research/{humId}/delete` | 削除 (論理削除) | admin |
| GET | `/research/{humId}/versions` | バージョン一覧 | public/authenticated/admin |
| GET | `/research/{humId}/versions/{version}` | 特定バージョン | public/authenticated/admin |
| POST | `/research/{humId}/versions/new` | 新バージョン作成 | owner/admin |
| GET | `/research/{humId}/dataset` | 紐付け Dataset 一覧 | public/authenticated/admin |
| POST | `/research/{humId}/dataset/new` | Dataset 新規作成 | owner/admin |
| POST | `/research/{humId}/submit` | draft -> review | owner/admin |
| POST | `/research/{humId}/approve` | review -> published | admin |
| POST | `/research/{humId}/reject` | review -> draft | admin |
| POST | `/research/{humId}/unpublish` | published -> draft | admin |
| PUT | `/research/{humId}/uids` | UIDs 更新 | admin |

### Dataset API

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/dataset` | 一覧取得 | public/authenticated/admin |
| GET | `/dataset/{datasetId}` | 詳細取得 | public/authenticated/admin |
| PUT | `/dataset/{datasetId}/update` | 更新 | owner/admin |
| POST | `/dataset/{datasetId}/delete` | 削除 (物理削除) | admin |
| GET | `/dataset/{datasetId}/versions` | バージョン一覧 | public/authenticated/admin |
| GET | `/dataset/{datasetId}/versions/{version}` | 特定バージョン | public/authenticated/admin |
| GET | `/dataset/{datasetId}/research` | 親 Research 取得 | public/authenticated/admin |

Dataset の新規作成は `POST /research/{humId}/dataset/new` で行う。

### Search API

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| POST | `/research/search` | Research 検索 (詳細フィルタ) | public/authenticated/admin |
| POST | `/dataset/search` | Dataset 検索 (詳細フィルタ) | public/authenticated/admin |
| GET | `/facets` | 全ファセット値一覧 (フィルタ対応) | public |
| GET | `/facets/{fieldName}` | 特定フィールドのファセット値 (フィルタ対応) | public |

### JGA 申請管理 API

JGA 申請データの read-only API。全エンドポイントに admin 認証が必要。

#### DS (データ提供申請)

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/jga-shinsei/ds` | DS 申請一覧 | admin |
| GET | `/jga-shinsei/ds/{jdsId}` | DS 申請詳細 | admin |

`jdsId` フォーマット: `J-DS` + 数字 (例: `J-DS002494`)

#### DU (データ利用申請)

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/jga-shinsei/du` | DU 申請一覧 | admin |
| GET | `/jga-shinsei/du/{jduId}` | DU 申請詳細 | admin |

`jduId` フォーマット: `J-DU` + 数字 (例: `J-DU006498`)

ページネーション: `page` (1始まり), `limit` (最大100)。
PII フィールド（電話番号、メールアドレス、住所等）は ES に格納されるが検索対象外（`noindex`）。

### その他

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/stats` | 統計情報 (カウント、ファセット集計) | public |
| GET | `/admin/is-admin` | admin 判定 | authenticated |
| GET | `/health` | ヘルスチェック | public |

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

### rawHtml パラメータ

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `includeRawHtml` | boolean | `false` | rawHtml フィールドを含めるか |

編集画面で元の HTML を表示・編集したい場合に `includeRawHtml=true` を指定する。

### ページネーション

オフセットベースのページネーションを採用。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `page` | integer | `1` | ページ番号 (1始まり) |
| `limit` | integer | `20` | 1ページあたりの件数 (最大100) |

`limit` に 101 以上を指定した場合は `400 Bad Request` を返す。

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
| **public** | 認証なし | `status=published` のリソースのみ |
| **authenticated** | 認証あり | public + 自分が `uids` に含まれる Research とその Dataset |
| **admin** | 認証あり + admin リスト | 全リソースアクセス可能、lifecycle 操作可能 |

## ワークフロー

Research のライフサイクル: `draft → review → published`。詳細は [architecture.md](architecture.md#状態遷移ワークフロー) を参照。

- **draft**: 編集可能。Dataset の作成・更新・削除が可能
- **review**: 編集不可。admin が承認または却下する
- **published**: 公開。変更するには新バージョンを作成する

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

RFC 7807 Problem Details 形式を採用。詳細は [architecture.md](architecture.md#エラーレスポンス) を参照。

```json
{
  "type": "https://humandbs.dbcls.jp/errors/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Research with ID 'hum0001' was not found",
  "instance": "/research/hum0001",
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "req-abc123"
}
```

全リクエストに `X-Request-ID` ヘッダーが付与される。エラー時の `requestId` でログとの突き合わせに使用できる。

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
   -> 新しい version を draft として作成

2. (Draft 保存と同様に編集・保存)

3. POST /research/{humId}/submit -> approve
   -> 新 version が公開される
```

### Research 削除

```plaintext
1. POST /research/{humId}/delete
   -> status が deleted に変更 (論理削除)
   -> 紐づく Dataset は自動的に物理削除される
```

## 検索の使い方

### 検索フロー

1. フロントエンドは `GET /facets` でファセット値 (件数付き) を取得
2. ユーザーがファセット値を選択
3. `POST /research/search` or `POST /dataset/search` で検索
4. `includeFacets=true` でフィルタ後のファセット件数も取得

`GET /facets` と `GET /facets/{fieldName}` はデータセットフィルタのクエリパラメータを受け付ける。パラメータを指定すると、マッチする Dataset に絞った件数が返る。パラメータ未指定ならグローバルカウント。`fieldName` は 18 種のファセット名のみ有効 (不正な名前は 400 エラー)。

ファセット値は認証状態により変わる。public ユーザーには published な Research に紐づく Dataset のファセットのみ返却される。

#### ファセット値の並び順

デフォルトでは件数の降順 (count desc) で返却される。特定フィールドについては `src/api/data/facet-order.json` で優先値リストを定義でき、指定された値が定義順で先頭に並び、残りが件数降順で続く。ES 結果に存在しない定義値は含まれない。

### フィルタの種類

#### ファセット検索 (カテゴリ値)

配列で指定し、OR 条件で動作する。複数フィルタ間は AND。

対象フィールド: criteria, subjectCountType, healthStatus, sex, ageGroup, tissues, cellLine, population, assayType, libraryKits, platform, readType, referenceGenome, fileTypes, processedDataTypes, isTumor, policyId, diseaseIcd10

#### フリーテキスト検索

- Research: `title`, `summary.aims.text`, `summary.methods.text`, `summary.targets.text`
- Dataset: `typeOfData`, `targets`

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

**POST /research/search**: Dataset 属性によるフィルターは `datasetFilters` 配下にネストする。Research 自身の属性 (`datePublished`, `dateModified`) はトップレベルに置く。

```json
{
  "query": "cancer",
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
