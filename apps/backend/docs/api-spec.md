# HumanDBs Backend API 仕様書

## 概要

HumanDBs Backend は REST API を提供し、Research（研究）と Dataset（データセット）リソースの検索・取得・管理を行う。

設計方針の詳細は [api-architecture.md](./api-architecture.md) を参照。

### 主要な設計ポイント

- **Research-Dataset 関係**: 1:N の関係。Dataset は親 Research の status に依存
- **Dataset 操作の制約**: 作成・更新・削除は **親 Research が draft 状態の場合のみ** 可能
- **Dataset 作成方法**: Dataset は単体では作成できない。必ず `POST /research/{humId}/dataset/new` で親 Research を指定して作成する
- **Dataset version 管理**: Research publish 時に version が確定。詳細は [api-architecture.md](./api-architecture.md) を参照

## エンドポイント一覧

### Research API (15 エンドポイント)

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/research` | 一覧取得 | public/authenticated/admin |
| POST | `/research/new` | 新規作成 | admin |
| GET | `/research/{humId}` | 詳細取得 | public/owner/admin |
| PUT | `/research/{humId}/update` | 更新 | owner/admin |
| POST | `/research/{humId}/delete` | 削除（論理削除） | admin |
| GET | `/research/{humId}/versions` | バージョン一覧 | public/owner/admin |
| GET | `/research/{humId}/versions/{version}` | 特定バージョン | public/owner/admin |
| POST | `/research/{humId}/versions/new` | 新バージョン作成 | owner/admin |
| GET | `/research/{humId}/dataset` | 紐付け Dataset 一覧 | public/owner/admin |
| POST | `/research/{humId}/dataset/new` | Dataset 新規作成 | owner/admin |
| POST | `/research/{humId}/submit` | draft -> review | owner/admin |
| POST | `/research/{humId}/approve` | review -> published | admin |
| POST | `/research/{humId}/reject` | review -> draft | admin |
| POST | `/research/{humId}/unpublish` | published -> draft | admin |
| PUT | `/research/{humId}/uids` | UIDs 更新 | admin |

### Dataset API (7 エンドポイント)

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/dataset` | 一覧取得 | public/authenticated/admin |
| GET | `/dataset/{datasetId}` | 詳細取得 | public/owner/admin |
| PUT | `/dataset/{datasetId}/update` | 更新 | owner/admin |
| POST | `/dataset/{datasetId}/delete` | 削除（物理削除） | admin |
| GET | `/dataset/{datasetId}/versions` | バージョン一覧 | public/owner/admin |
| GET | `/dataset/{datasetId}/versions/{version}` | 特定バージョン | public/owner/admin |
| GET | `/dataset/{datasetId}/research` | 親 Research 取得 | public/owner/admin |

※ Dataset の新規作成は `POST /research/{humId}/dataset/new` で行う

### Search API (4 エンドポイント)

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| POST | `/research/search` | Research 検索（詳細フィルタ） | public/authenticated/admin |
| POST | `/dataset/search` | Dataset 検索（詳細フィルタ） | public/authenticated/admin |
| GET | `/facets` | 全ファセット値一覧 | public |
| GET | `/facets/{fieldName}` | 特定フィールドのファセット値 | public |

### Stats API (1 エンドポイント)

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/stats` | 統計情報（カウント、ファセット集計） | public |

### Admin API (1 エンドポイント)

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/admin/is-admin` | admin 判定 | authenticated |

※ レビュー待ち一覧は `GET /research?status=review` で取得可能（admin のみ）

### Health API (1 エンドポイント)

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/health` | ヘルスチェック | public |

## UI ユースケースと API 呼び出し

フロントエンド実装時の参考として、主要なユースケースごとの API 呼び出しパターンを示す。

### ユースケース 1: 新規 Research 作成

**操作**: admin が新しい Research を作成する

```
1. POST /research/new
   -> humId を指定する場合はリクエストボディに含める
   -> 指定しない場合は自動採番（hum0001, hum0002, ...）
   -> status=draft で作成される
   -> レスポンスから humId を取得
```

### ユースケース 2: Research 編集画面で Draft 保存

**操作**: Research 作成画面で Research 情報と Dataset を編集し、「Draft として保存」ボタンを押す

**前提**: Research 作成画面では、Research の情報と複数の Dataset を同時に編集できる

```
1. PUT /research/{humId}/update
   -> Research のメタデータを更新

2. 新規 Dataset がある場合:
   POST /research/{humId}/dataset/new (Dataset ごとに)
   -> datasetId を指定する場合はリクエストボディに含める
   -> 指定しない場合は DRAFT-{humId}-{uuid} 形式で自動採番

3. 既存 Dataset の更新がある場合:
   PUT /dataset/{datasetId}/update (Dataset ごとに)
```

**備考**: 各 API は順次呼び出す。途中でエラーが発生した場合、フロントエンドでエラーハンドリングを行う。

### ユースケース 3: レビュー提出と承認

**操作**: owner が draft を提出し、admin が承認する

```
[owner]
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

### ユースケース 4: 公開済み Research の更新（新バージョン作成）

**操作**: published な Research に Dataset を追加したい

```
1. POST /research/{humId}/versions/new
   -> 新しい version を draft として作成

2. （ユースケース 2 と同様に編集・保存）

3. POST /research/{humId}/submit -> approve
   -> 新 version が公開される
```

### ユースケース 5: Research 削除

**操作**: admin が Research を削除する

```
1. POST /research/{humId}/delete
   -> status が deleted に変更（論理削除）
   -> 紐づく Dataset は自動的に物理削除される
```

## 共通仕様

### 言語パラメータ

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `lang` | `"ja"` \| `"en"` | `"ja"` | レスポンスの言語を指定 |

`lang` パラメータで、レスポンス内のテキストフィールドの言語を切り替える。

**例**:

```
GET /research/hum0001           → title: "日本語タイトル"  (デフォルト: ja)
GET /research/hum0001?lang=ja   → title: "日本語タイトル"
GET /research/hum0001?lang=en   → title: "English Title"
```

### rawHtml パラメータ

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `includeRawHtml` | boolean | `false` | rawHtml フィールドを含めるか |

`summary.aims.rawHtml` などの rawHtml フィールドは、デフォルトではレスポンスに含まれない。編集画面で元の HTML を表示・編集したい場合に `includeRawHtml=true` を指定する。

**対象エンドポイント**: `GET /research`, `GET /research/{humId}`, `GET /dataset`, `GET /dataset/{datasetId}`

### バージョン指定

バージョンはパスパラメータで指定する:

```
GET /research/{humId}/versions/v1
GET /dataset/{datasetId}/versions/v1
```

`GET /research/{humId}` や `GET /dataset/{datasetId}` は常に最新バージョンを返す。

### ページネーション

オフセットベースのページネーションを採用。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `page` | integer | `1` | ページ番号（1始まり） |
| `limit` | integer | `20` | 1ページあたりの件数（最大100） |

**備考**: `limit` に 101 以上を指定した場合は `400 Bad Request` を返す。

**レスポンス形式:**

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### エラーレスポンス

```json
{
  "error": "NOT_FOUND",
  "message": "Research hum0001 not found"
}
```

| コード | HTTP Status | 説明 |
|--------|-------------|------|
| `VALIDATION_ERROR` | 400 | 入力値バリデーション失敗 |
| `UNAUTHORIZED` | 401 | 認証なし/無効 |
| `FORBIDDEN` | 403 | 権限なし |
| `NOT_FOUND` | 404 | リソースが存在しない |
| `CONFLICT` | 409 | 状態競合（無効な遷移、楽観的ロック失敗） |
| `INTERNAL_ERROR` | 500 | サーバーエラー |

### 楽観的ロック（同時編集の競合検出）

更新系 API（`PUT /research/{humId}/update` など）では、楽観的ロックにより同時編集の競合を検出する。

**動作**:

- 2人のユーザーが同時に同じ Research を編集し、ほぼ同時に保存ボタンを押した場合
- **先に** サーバーに到達したリクエストが採用され、更新が成功する
- **後から** 到達したリクエストは `409 Conflict` エラーになる

**フロントエンドでの対応**:

`409 Conflict` が返ってきた場合、以下のいずれかの対応が必要:

1. **再取得して通知**: 最新データを取得し直し、「他のユーザーが更新しました。変更内容を確認してください」とユーザーに通知する
2. **自動リトライ**: 最新データを取得し、ユーザーの変更を再適用して再送信する（マージロジックが必要）

**技術詳細**:

GET でリソースを取得した際のレスポンスに以下のフィールドが含まれる:

```json
{
  "humId": "hum0001",
  "title": "...",
  "_seq_no": 42,
  "_primary_term": 1
}
```

更新リクエスト時にこれらの値を送信することで競合を検出する:

```json
{
  "title": { "ja": "新しいタイトル", "en": "New Title" },
  "_seq_no": 42,
  "_primary_term": 1
}
```

フロントエンドは取得時の `_seq_no` と `_primary_term` を保持し、更新時に送信する必要がある。

## Research API 詳細

### GET /research

Research 一覧を取得。

**認可**:

- public: `status=published` のみ
- authenticated: 自分が `uids` に含まれる draft/review も含む
- admin: 全て

**クエリパラメータ**:

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `lang` | `"ja"` \| `"en"` | `"ja"` | 言語 |
| `page` | integer | `1` | ページ番号 |
| `limit` | integer | `20` | 1ページあたりの件数 |
| `sort` | string | `"humId"` | ソート項目 (`humId`, `title`, `releaseDate`) |
| `order` | `"asc"` \| `"desc"` | `"asc"` | ソート順 |
| `status` | string | - | status でフィルタ（下記参照） |
| `includeFacets` | boolean | `false` | ファセット集計を含めるか |

**備考**:

- 全文検索やフィルタ条件を指定する場合は `POST /research/search` を使用する

**status パラメータの権限**:

| ユーザー種別 | 指定可能な status | 範囲外を指定した場合 |
|-------------|------------------|---------------------|
| public | `published` のみ | 403 Forbidden |
| authenticated | `draft`, `review`, `published`（自分の） | 403 Forbidden |
| admin | `draft`, `review`, `published`, `deleted` | - |

レビュー待ち一覧は admin が `?status=review` で取得する。

### POST /research/new

新規 Research を作成。

**認可**: admin のみ

**リクエストボディ**:

```typescript
interface CreateResearchRequest {
  humId?: string                      // 省略時は自動採番（hum0001, hum0002, ...）
  title?: BilingualText               // 省略時は { ja: null, en: null }
  summary?: BilingualResearchSummary  // 省略時は各フィールドが null/[]
  dataProvider?: BilingualPerson[]    // 省略時は []
  researchProject?: BilingualResearchProject[]
  grant?: BilingualGrant[]
  relatedPublication?: BilingualPublication[]
  uids?: string[]                     // 省略時は []（admin のみ編集可能）
  initialReleaseNote?: BilingualText
}
```

**備考**:

- 作成時は `status=draft` で作成される
- 全フィールドが optional。省略時はデフォルト値（null や空配列）が設定される
- `uids` が空の場合、admin 以外は編集できない

**レスポンス例**:

```json
{
  "humId": "hum0001",
  "status": "draft",
  "version": "v1",
  "title": { "ja": null, "en": null },
  "datePublished": "2024-01-15",
  "dateModified": "2024-01-15",
  "_seq_no": 0,
  "_primary_term": 1
}
```

### GET /research/{humId}

Research の詳細を取得。

**認可**:

- public: `status=published` のみ
- auth: 自分が `uids` に含まれるリソースも取得可能
- admin: 全て

**クエリパラメータ**:

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `lang` | `"ja"` \| `"en"` | `"ja"` | 言語 |

**備考**: 特定バージョンを取得する場合は `GET /research/{humId}/versions/{version}` を使用する。

### PUT /research/{humId}/update

Research を更新。

**認可**: owner または admin

**リクエストボディ**:

```typescript
interface UpdateResearchRequest {
  title?: BilingualText
  summary?: Partial<BilingualResearchSummary>
  dataProvider?: BilingualPerson[]
  researchProject?: BilingualResearchProject[]
  grant?: BilingualGrant[]
  relatedPublication?: BilingualPublication[]
  controlledAccessUser?: BilingualPerson[]
}
```

**備考**:

- Research の `url` フィールド（HumanDBs ポータルへのリンク）は humId から自動生成されるため、更新対象外
- 楽観的ロック（`_seq_no`, `_primary_term`）で競合を検出

**レスポンス例**:

```json
{
  "humId": "hum0001",
  "status": "draft",
  "title": { "ja": "更新後のタイトル", "en": "Updated Title" },
  "dateModified": "2024-01-16",
  "_seq_no": 1,
  "_primary_term": 1
}
```

### POST /research/{humId}/delete

Research を削除（論理削除: `status="deleted"`）。

**認可**: admin のみ

**備考**:

- 論理削除を採用する理由: humId の再利用を防ぎ、外部参照の整合性を維持するため
- 紐づく Dataset は自動的に物理削除される

### GET /research/{humId}/versions

Research のバージョン一覧を取得。

**レスポンス**:

```json
{
  "data": [
    {
      "humId": "hum0001",
      "humVersionId": "hum0001.v2",
      "version": "v2",
      "versionReleaseDate": "2024-01-15",
      "releaseNote": "データセットを追加",
      "datasets": [
        { "datasetId": "JGAD000001", "version": "v2" }
      ]
    }
  ]
}
```

### POST /research/{humId}/versions/new

新バージョンを作成。

**認可**: owner または admin

**リクエストボディ**:

```typescript
interface CreateVersionRequest {
  releaseNote?: BilingualText
}
```

**備考**:

- 前バージョンの datasets は draft Research の dataset list に自動コピーされる
- Dataset の追加は `POST /research/{humId}/dataset/new` で行う
- Dataset の削除は `POST /dataset/{datasetId}/delete` で行う

### GET /research/{humId}/dataset

Research に紐づく Dataset の一覧を取得。

**認可**:

- public: Research が `status=published` の場合のみ
- owner: 自分が owner の Research
- admin: 全て

**クエリパラメータ**:

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `lang` | `"ja"` \| `"en"` | `"ja"` | 言語 |
| `page` | integer | `1` | ページ番号 |
| `limit` | integer | `20` | 1ページあたりの件数 |

**レスポンス**:

```json
{
  "data": [
    {
      "datasetId": "JGAD000001",
      "version": "v1",
      "releaseDate": "2024-01-15",
      "criteria": "Controlled-access (Type I)",
      "typeOfData": "Whole genome sequencing"
    }
  ],
  "pagination": { ... }
}
```

### PUT /research/{humId}/uids

Research の uids（owner リスト）を更新。

**認可**: admin のみ

**リクエストボディ**:

```typescript
interface UpdateUidsRequest {
  uids: string[]  // Keycloak sub (UUID) の配列
}
```

### ワークフロー API

ワークフロー API は全て以下の形式でレスポンスを返す:

```json
{
  "humId": "hum0001",
  "status": "review",
  "dateModified": "2024-01-16",
  "_seq_no": 2,
  "_primary_term": 1
}
```

#### POST /research/{humId}/submit

レビューに提出（draft -> review）。

**認可**: owner/admin

#### POST /research/{humId}/approve

承認して公開（review -> published）。

**認可**: admin

**備考**: この時点で紐づく Dataset の version が確定し、公開される。

#### POST /research/{humId}/reject

却下（review -> draft）。

**認可**: admin

#### POST /research/{humId}/unpublish

非公開に戻す（published -> draft）。

**認可**: admin

## Dataset API 詳細

> **重要**: Dataset は単体では作成できない。必ず `POST /research/{humId}/dataset/new` で親 Research を指定して作成する。また、Dataset の作成・更新・削除は **親 Research が draft 状態の場合のみ** 可能。

### GET /dataset

Dataset 一覧を取得。

**備考**: 全文検索やフィルタ条件を指定する場合は `POST /dataset/search` を使用する。

**認可**:

- public: 紐づく Research が `status=published` のもののみ
- authenticated: 自分が owner の Research に紐づく Dataset も含む
- admin: 全て

**クエリパラメータ**:

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `lang` | `"ja"` \| `"en"` | `"ja"` | 言語 |
| `page` | integer | `1` | ページ番号 |
| `limit` | integer | `20` | 1ページあたりの件数 |
| `sort` | string | `"datasetId"` | ソート項目 (`datasetId`, `releaseDate`) |
| `order` | `"asc"` \| `"desc"` | `"asc"` | ソート順 |
| `humId` | string | - | 親 Research ID で絞り込み |
| `includeFacets` | boolean | `false` | ファセット集計を含めるか |

### POST /research/{humId}/dataset/new

新規 Dataset を作成し、指定した Research に紐付ける。

**認可**: owner（親 Research の owner）または admin

**前提条件**: Research が draft 状態であること

**リクエストボディ**:

```typescript
interface CreateDatasetRequest {
  datasetId?: string        // 省略時は DRAFT-{humId}-{uuid} 形式で自動採番
  releaseDate?: string
  criteria?: "Controlled-access (Type I)" | "Controlled-access (Type II)" | "Unrestricted-access"
  typeOfData?: BilingualText
  experiments?: Experiment[]
}
```

**備考**:

- `datasetId` を指定すると、その ID で Dataset を作成（クロール結果インポート時など）
- `datasetId` を省略すると、`DRAFT-{humId}-{uuid}` 形式で自動採番
- 作成された Dataset は draft Research の dataset list に自動追加される
- Dataset の version は、親 Research が publish されるまで確定しない

### GET /dataset/{datasetId}

Dataset の詳細を取得。

**認可**:

- public: 紐づく Research が `status=published` のもののみ
- auth: 自分が owner の Research に紐づく Dataset も取得可能
- admin: 全て

**クエリパラメータ**:

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `lang` | `"ja"` \| `"en"` | `"ja"` | 言語 |

**備考**: 特定バージョンを取得する場合は `GET /dataset/{datasetId}/versions/{version}` を使用する。

### PUT /dataset/{datasetId}/update

Dataset を更新。

**認可**: owner（親 Research の owner）または admin

**前提条件**: 親 Research が draft 状態であること（published の Dataset は直接更新不可）

**リクエストボディ**:

```typescript
interface UpdateDatasetRequest {
  releaseDate?: string
  criteria?: string
  typeOfData?: BilingualText
  experiments?: Experiment[]
}
```

**備考**:

- 初回更新時は新しい version が作成され、draft Research の dataset list が自動更新される
- 2回目以降の更新では version は上がらず、同じ version の中身が上書きされる
- 詳細は「Dataset Version 管理」セクションを参照

### POST /dataset/{datasetId}/delete

Dataset を削除（物理削除）。

**認可**: admin のみ

**前提条件**: 親 Research が draft 状態であること（published の Dataset は直接削除不可）

**備考**:

- version クエリパラメータで特定バージョンのみ削除可能。指定なしは全バージョン削除
- 削除後、draft Research の dataset list から自動的に参照が削除される

### GET /dataset/{datasetId}/research

Dataset の親 Research を取得。

**レスポンス**:

```json
{
  "data": [
    {
      "humId": "hum0001",
      "title": "研究タイトル",
      ...
    }
  ]
}
```

**備考**: Dataset.humId が指す 1つの Research を返す（1:N 関係）。

## Search API 詳細

### POST /research/search

Research を検索（詳細フィルタ対応）。

**全文検索対象**: `title`, `summary.aims.text`, `summary.methods.text`, `summary.targets.text`

**リクエストボディ**:

```typescript
interface ResearchSearchBody {
  // Pagination
  page?: number                  // default: 1
  limit?: number                 // default: 20, max: 100

  // Sort
  sort?: "humId" | "datePublished" | "dateModified" | "relevance"
  order?: "asc" | "desc"         // default: "asc"（relevance 時は "desc"）

  // Full-text search
  query?: string                 // title, summary を検索

  // Date range filters
  datePublished?: { min?: string; max?: string }
  dateModified?: { min?: string; max?: string }

  // Dataset attribute filters（紐づく Dataset の条件で絞り込む）
  datasetFilters?: DatasetFilters

  // Options
  includeFacets?: boolean        // default: false
}
```

**備考**: `datasetFilters` を指定すると、「条件を満たす Dataset を持つ Research」を検索できる。

### POST /dataset/search

Dataset を検索（詳細フィルタ対応）。

**全文検索対象**: `experiments.header.text`, `experiments.data.*`, `experiments.footers.text`

**リクエストボディ**:

```typescript
interface DatasetSearchBody {
  // Pagination
  page?: number                  // default: 1
  limit?: number                 // default: 20, max: 100

  // Sort
  sort?: "datasetId" | "releaseDate" | "relevance"
  order?: "asc" | "desc"         // default: "asc"（relevance 時は "desc"）

  // Full-text search
  query?: string                 // experiments 全体を検索

  // Parent Research filter
  humId?: string                 // 特定の Research に紐づく Dataset のみ

  // Dataset filters
  filters?: DatasetFilters

  // Options
  includeFacets?: boolean        // default: false
}
```

### GET /facets

全ファセット値リストを取得（件数付き）。

**レスポンス**:

```json
{
  "criteria": [
    { "value": "Controlled-access (Type I)", "count": 200 },
    { "value": "Controlled-access (Type II)", "count": 150 },
    { "value": "Unrestricted-access", "count": 100 }
  ],
  "assayType": [
    { "value": "WGS", "count": 120 },
    { "value": "WES", "count": 80 },
    { "value": "RNA-seq", "count": 60 }
  ],
  "healthStatus": [
    { "value": "healthy", "count": 200 },
    { "value": "affected", "count": 180 },
    { "value": "mixed", "count": 50 }
  ]
}
```

### GET /facets/{fieldName}

特定フィールドのファセット値を取得（件数付き）。

**レスポンス**:

```json
{
  "fieldName": "assayType",
  "values": [
    { "value": "WGS", "count": 120 },
    { "value": "WES", "count": 80 },
    { "value": "RNA-seq", "count": 60 }
  ]
}
```

## 検索フィルタ詳細

`POST /research/search` および `POST /dataset/search` で使用する DatasetFilters。

```typescript
interface DatasetFilters {
  // === ファセットフィルタ（カテゴリ値） ===
  // 配列で指定: OR 条件（いずれかに一致すればヒット）

  // 基本属性
  criteria?: string[]               // "Controlled-access (Type I)" | "Controlled-access (Type II)" | "Unrestricted-access"

  // 被験者情報
  subjectCountType?: ("individual" | "sample" | "mixed")[]
  healthStatus?: ("healthy" | "affected" | "mixed")[]
  sex?: ("male" | "female" | "mixed")[]
  ageGroup?: ("infant" | "child" | "adult" | "elderly" | "mixed")[]

  // 疾患
  disease?: string                  // ラベルの部分一致（フリーテキスト検索）
  diseaseIcd10?: string[]           // ICD10 コード（ファセット選択）

  // 生体サンプル
  tissue?: string[]                 // ファセット選択
  isTumor?: boolean
  cellLine?: string[]               // ファセット選択
  population?: string[]             // ファセット選択

  // 実験手法
  assayType?: string[]              // ファセット選択
  libraryKits?: string[]            // ファセット選択

  // プラットフォーム
  platform?: string[]               // "Illumina NovaSeq 6000" 形式（ファセット選択）
  readType?: ("single-end" | "paired-end")[]

  // シーケンス品質
  referenceGenome?: string[]        // ファセット選択

  // データ情報
  fileType?: string[]               // ファセット選択
  processedDataTypes?: string[]     // ファセット選択
  hasPhenotypeData?: boolean

  // ポリシー
  policyId?: string[]               // ファセット選択

  // === Range フィルタ（数値/日付範囲） ===
  releaseDate?: { min?: string; max?: string }   // "YYYY-MM-DD" 形式
  subjectCount?: { min?: number; max?: number }
  readLength?: { min?: number; max?: number }
  sequencingDepth?: { min?: number; max?: number }
  targetCoverage?: { min?: number; max?: number }
  dataVolumeGb?: { min?: number; max?: number }

  // バリアント数
  variantSnv?: { min?: number; max?: number }
  variantIndel?: { min?: number; max?: number }
  variantCnv?: { min?: number; max?: number }
  variantSv?: { min?: number; max?: number }
  variantTotal?: { min?: number; max?: number }
}
```

**フィルタの動作**:

| フィルタ種別 | 動作 | 例 |
|-------------|------|-----|
| 配列フィルタ | OR（いずれかに一致） | `assayType=["WGS","WES"]` → WGS または WES |
| 複数フィルタ間 | AND（全条件を満たす） | `assayType=["WGS"]` + `healthStatus=["affected"]` → 両方を満たす |
| 部分一致 | 文字列の一部を含む | `disease="cancer"` → "lung cancer" にヒット |
| Range | min/max の範囲内 | `subjectCount={min:100}` → 100 以上 |

**検索フロー**:

1. フロントエンドは `GET /facets` でファセット値（件数付き）を取得
2. ユーザーがファセット値を選択
3. `POST /research/search` or `POST /dataset/search` で検索
4. `includeFacets=true` でフィルタ後のファセット件数も取得

## Stats API 詳細

### GET /stats

統計情報を取得（ダッシュボード用）。published なリソースのみを対象とする。

**認可**: public

**レスポンス**:

```json
{
  "research": {
    "total": 135
  },
  "dataset": {
    "total": 500
  },
  "facets": {
    "criteria": {
      "Controlled-access (Type I)": { "research": 50, "dataset": 200 },
      "Controlled-access (Type II)": { "research": 40, "dataset": 150 },
      "Unrestricted-access": { "research": 45, "dataset": 150 }
    },
    "assayType": {
      "WGS": { "research": 30, "dataset": 100 },
      "WES": { "research": 25, "dataset": 80 },
      "RNA-seq": { "research": 20, "dataset": 70 }
    },
    "healthStatus": {
      "healthy": { "research": 60, "dataset": 200 },
      "affected": { "research": 55, "dataset": 250 },
      "mixed": { "research": 20, "dataset": 50 }
    }
  }
}
```

**備考**:
- published な Research/Dataset のみをカウント対象とする
- `facets` は主要なファセットフィールドの値ごとに、Research 件数と Dataset 件数を返す

## Admin API 詳細

### GET /admin/is-admin

現在のユーザーが admin かどうかを確認。

**認可**: authenticated（認証必須だが admin 不要）

**レスポンス**:

```json
{
  "isAdmin": true
}
```

## Health API 詳細

### GET /health

ヘルスチェック。

**認可**: public

**レスポンス**:

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 残課題

1. **fields パラメータの詳細設計**: フロントエンド要件を確認後、対応フィールドを決定。

2. **searchable merge ロジック**: Dataset の experiments 以下の searchable を merge するロジックの実装。

3. **`loadResearchAndAuthorize` ミドルウェア適用**: routes/research.ts, routes/dataset.ts に適用してハンドラを簡素化。

4. **`updateResearch` から url パラメータを削除**: url は humId から自動生成されるため、更新不可にする。

5. **GET /research から q パラメータを削除**: 検索機能は POST /research/search に統合する。

6. **GET /admin/pending-reviews を削除**: GET /research に status パラメータを追加し、`?status=review` で代替する。

7. **createResearch の全フィールド optional 化**: title, summary, dataProvider 等を optional にし、省略時はデフォルト値を設定する。

8. **includeRawHtml パラメータの実装**: GET /research, GET /research/{humId}, GET /dataset, GET /dataset/{datasetId} に `includeRawHtml` パラメータを追加。デフォルトは false で rawHtml を除外する。

9. **createResearchVersion の datasets 自動コピー**: POST /research/{humId}/versions/new で datasets パラメータを削除し、前バージョンの datasets を draft Research の dataset list に自動コピーする。

10. **Dataset 更新/削除時の draft Research 自動更新**:
    - PUT /dataset/{datasetId}/update: 初回更新時に新 version を作成し、draft Research の dataset list を自動更新。2回目以降は同じ version を上書き。
    - POST /dataset/{datasetId}/delete: draft Research の dataset list から参照を自動削除。
    - いずれも親 Research が draft 状態でのみ実行可能。

11. **GET /stats の実装**: Research/Dataset のカウントとファセット集計を返す統計 API を実装する。
