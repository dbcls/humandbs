# HumanDBs REST API アーキテクチャ

## 概要

HumanDBs の REST API アーキテクチャ設計ドキュメント。認証・認可、バージョニング、承認フロー、検索機能を含む完全な API 仕様を定義する。

## 確定した設計方針

| 項目 | 決定 |
|------|------|
| 認証 | Keycloak (OIDC) - public client |
| OIDC_ISSUER_URL | `https://idp-staging.ddbj.nig.ac.jp/realms/master` |
| OIDC_CLIENT_ID | `humandbs-dev` |
| API prefix | 環境変数 `HUMANDBS_API_URL_PREFIX` で設定（デフォルト: なし） |
| リソース名 | 単数形 (`/research`, `/dataset`) |
| リソース関係 | Research <-> Dataset 多対多 |
| 多対多の表現 | ハイブリッド（取得は埋め込み、変更はリンクリソース） |
| バージョニング | シンプル方式（最新 + 読み取り専用アーカイブ） |
| 承認フロー | draft -> review -> published（Research のみ） |
| Dataset の公開 | Research に従属（Dataset 自体は status を持たない） |
| 検索機能 | 各リソースエンドポイントに統合（`/research`, `/dataset`） |
| API ドキュメント | `/docs` に OpenAPI UI |

---

## 型定義の構成

```
apps/backend/
├── src/
│   ├── api/
│   │   ├── types.ts          # API 型定義（主要）
│   │   └── es-client.ts      # Elasticsearch クライアント
│   └── crawler/
│       └── types/            # クローラーの型定義（ES 投入用）
│           ├── unified.ts    # 最終出力型（ja/en 統合）
│           ├── extracted.ts  # LLM 抽出型（searchable フィールド）
│           └── ...
└── types/
    └── shared-types.ts       # Legacy（Frontend 向け export のみ）
```

### 型の関係

```
crawler/types/unified.ts     API レスポンス用の理想型（将来）
         ↓
crawler/types/extracted.ts   SearchableDataset（searchable フィールド付き）
         ↓
api/types.ts                 Es*Schema（現在の ES ドキュメント形式）
         ↓
Elasticsearch                実際に格納されるドキュメント
```

### api/types.ts の主要な型

| カテゴリ | 型 | 説明 |
|----------|-----|------|
| 言語 | `langType`, `LangType` | `"ja"` \| `"en"` |
| ES Doc | `EsDatasetDocSchema` | ES Dataset ドキュメント |
| ES Doc | `EsResearchDocSchema` | ES Research ドキュメント |
| ES Doc | `EsResearchVersionDocSchema` | ES ResearchVersion ドキュメント |
| ES Doc | `EsResearchDetailSchema` | Research 詳細レスポンス |
| 検索 | `ResearchSearchQuerySchema` | Research 検索クエリ |
| 検索 | `DatasetSearchQuerySchema` | Dataset 検索クエリ |
| 検索 | `ResearchSearchResponseSchema` | Research 検索レスポンス |
| 検索 | `DatasetSearchResponseSchema` | Dataset 検索レスポンス |
| ファセット | `FacetItemSchema`, `FacetsMapSchema` | ファセット集計結果 |
| 一覧 | `ResearchSummarySchema` | Research 一覧用サマリー |

---

## エンドポイント一覧

### Research

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/research` | 一覧 + 検索（public は published のみ） | public/auth |
| POST | `/research` | 新規作成 | researcher/admin |
| GET | `/research/{humId}` | 詳細取得 | public/owner/admin |
| PUT | `/research/{humId}` | 全体更新 | owner/admin |
| DELETE | `/research/{humId}` | 削除 | admin |
| GET | `/research/{humId}/versions` | バージョン一覧 | public/owner/admin |
| GET | `/research/{humId}/dataset` | 紐付け Dataset 一覧 | public/owner/admin |
| POST | `/research/{humId}/dataset/{datasetId}` | Dataset 紐付け追加 | owner/admin |
| DELETE | `/research/{humId}/dataset/{datasetId}` | Dataset 紐付け削除 | owner/admin |

### 状態遷移（Research のみ）

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| POST | `/research/{humId}/submit` | draft → review | owner |
| POST | `/research/{humId}/approve` | review → published | admin |
| POST | `/research/{humId}/reject` | review → draft | admin |
| POST | `/research/{humId}/unpublish` | published → draft | admin |

### Dataset

| Method | Path | 説明 | 認可 |
|--------|------|------|------|
| GET | `/dataset` | 一覧 + 検索（published Research に紐付くもののみ） | public/auth |
| POST | `/dataset` | 新規作成 | researcher/admin |
| GET | `/dataset/{datasetId}` | 詳細取得 | public(pub Research経由)/owner/admin |
| PUT | `/dataset/{datasetId}` | 全体更新 | owner/admin |
| DELETE | `/dataset/{datasetId}` | 削除 | admin |
| GET | `/dataset/{datasetId}/versions` | バージョン一覧 | public/owner/admin |
| GET | `/dataset/{datasetId}/research` | 紐付け Research 一覧 | public/owner/admin |

### 管理者

| Method | Path | 説明 |
|--------|------|------|
| GET | `/admin/pending-reviews` | レビュー待ち一覧 |
| GET | `/admin/users` | ユーザー一覧 |
| PATCH | `/admin/users/{userId}/role` | ロール変更 |

### ユーティリティ

| Method | Path | 説明 |
|--------|------|------|
| GET | `/health` | ヘルスチェック |
| GET | `/users/is-admin` | 管理者判定 |
| GET | `/docs` | OpenAPI UI (Swagger) |

---

## 検索機能

### GET /research 検索パラメータ

```typescript
interface ResearchSearchQuery {
  // ページネーション
  page?: number                 // default: 1
  limit?: number                // default: 20, max: 100
  lang?: "ja" | "en"            // default: "en"
  sort?: "humId" | "title" | "releaseDate" | "relevance"  // default: "humId"
  order?: "asc" | "desc"        // default: "asc"

  criteria
  policy

  // 全文検索
  q?: string                    // タイトル、概要、提供者名で検索

  // Research 固有フィルタ
  releasedAfter?: string        // 公開日 >= (ISO 8601)
  releasedBefore?: string       // 公開日 <=

  // Dataset 属性による絞り込み（カンマ区切りで OR）
  assayType?: string            // 解析手法
  disease?: string              // 疾患名（部分一致）
  tissue?: string               // 組織名
  population?: string           // 集団
  platform?: string             // プラットフォーム（部分一致）
  criteria?: string             // アクセス条件
  fileType?: string             // ファイル形式
  hasHealthyControl?: boolean   // 健常者コントロール有無
  hasTumor?: boolean            // 腫瘍サンプル有無
  hasCellLine?: boolean         // 細胞株有無
  minSubjects?: number          // 最小サンプル数

  // ファセット
  includeFacets?: boolean       // ファセット集計を含めるか
}
```

### GET /dataset 検索パラメータ

```typescript
interface DatasetSearchQuery {
  // ページネーション
  page?: number                 // default: 1
  limit?: number                // default: 20, max: 100
  lang?: "ja" | "en"            // default: "en"
  sort?: "datasetId" | "releaseDate" | "subjectCount" | "relevance"
  order?: "asc" | "desc"        // default: "asc"

  criteria
  policy

  // 全文検索
  q?: string                    // データ種別で検索

  // Dataset フィルタ
  humId?: string                // 親 Research ID（完全一致）
  criteria?: string             // アクセス条件（カンマ区切りで OR）
  typeOfData?: string           // データ種別（部分一致）
  assayType?: string            // 解析手法（カンマ区切りで OR）
  disease?: string              // 疾患名（部分一致）
  tissue?: string               // 組織名（カンマ区切りで OR）
  population?: string           // 集団（カンマ区切りで OR）
  platform?: string             // プラットフォーム（部分一致）
  fileType?: string             // ファイル形式（カンマ区切りで OR）
  hasHealthyControl?: boolean
  hasTumor?: boolean
  hasCellLine?: boolean
  minSubjects?: number          // 最小サンプル数
  maxSubjects?: number          // 最大サンプル数

  // ファセット
  includeFacets?: boolean
}
```

### 複数値指定ルール

カンマ区切りで OR 条件:

```
GET /dataset?assayType=RNA-seq,WGS&criteria=Unrestricted-access
```

→ `(assayType = "RNA-seq" OR "WGS") AND criteria = "Unrestricted-access"`

### ファセット

`includeFacets=true` 指定時、レスポンスに `facets` フィールドを含める:

```json
{
  "data": [...],
  "pagination": {...},
  "facets": {
    "criteria": [
      { "value": "Controlled-access (Type I)", "count": 150 },
      { "value": "Controlled-access (Type II)", "count": 50 },
      { "value": "Unrestricted-access", "count": 30 }
    ],
    "assayType": [
      { "value": "RNA-seq", "count": 120 },
      { "value": "WGS", "count": 80 }
    ],
    "disease": [...],
    "tissue": [...],
    "population": [...],
    "platformVendor": [...],
    "fileType": [...],
    "hasHealthyControl": [
      { "value": "true", "count": 80 },
      { "value": "false", "count": 150 }
    ]
  }
}
```

### Research を Dataset 属性で検索する仕組み（2段階検索）

Dataset 属性で Research を絞り込む場合、内部で2段階検索を実行:

```
[ Request ]
  GET /research?assayType=RNA-seq
        |
        v
[ Step 1: Dataset 検索 ]
  POST /dataset/_search
  - filter: assayType = RNA-seq
  - aggs: humIds
  => humIds: ["hum0001", "hum0015", ...]

        |
        v
[ Step 2: Research 検索 ]
  POST /research/_search
  - filter: humId IN humIds
  => Research 結果
```

---

## 認可マトリクス

認証取っているけど、その research に紐づいてない人

| 操作 | public | researcher (owner) | researcher (other) ほぼ public | admin (事務局だけ) |
|------|--------|-------------------|-------------------|-------|
| Read (published) | ✅ | ✅ | ✅ | ✅ |
| Read (draft/review) | ❌ | ✅ | ❌ | ✅ |
| Create | ❌ | ❌ | ❌ | ✅ |
| Update | ❌ | ❌ | ❌ | ✅ |
| Delete | ❌ | ❌ | ❌ | ✅ |
| Submit (draft→review) | ❌ | ❌ | ❌ | ✅ |
| Approve/Reject | ❌ | ❌ | ❌ | ✅ |

## 状態遷移図

```
         ┌──────────┐
         │  draft   │◄─────────────────┐
         └────┬─────┘                  │
              │ POST /submit           │ POST /reject
              │ (owner)                │ (admin)
              ▼                        │
         ┌──────────┐                  │
         │  review  │──────────────────┤
         └────┬─────┘                  │
              │ POST /approve          │
              │ (admin)                │
              ▼                        │
         ┌──────────┐                  │
         │published │──────────────────┘
         └──────────┘    POST /unpublish (admin)
```

research の属性として、draft, review, published という
approve した人、
owner による確認済み status を管理したほうがいいのか？(そこはメールベース)
review は owner and admin

## Keycloak 連携

### 環境変数

```bash
OIDC_ISSUER_URL=https://idp-staging.ddbj.nig.ac.jp/realms/master
OIDC_CLIENT_ID=humandbs-dev
```

### Public Client

- フロントエンドから直接 Keycloak に認証
- バックエンドは JWT トークンを検証（署名検証あり）
- public client のため、client secret は不要

### 管理者判定

- **JWT claims からの role 抽出は行わない**
- `admin_uids.json` ファイルで管理者 UID を管理
- `isAdmin` は API 実行時に `admin_uids.json` と照合して決定

### JWT Claims

```typescript
interface JwtClaims {
  sub: string              // ユーザー ID（これのみ使用）
  preferred_username?: string
  email?: string
  iat?: number
  exp?: number
}
```

---

## エラーレスポンス

### 標準フォーマット

```json
{
  "error": "NOT_FOUND",
  "message": "Research not found: hum9999"
}
```

### エラーコード一覧

| コード | HTTP Status | 説明 |
|--------|-------------|------|
| `VALIDATION_ERROR` | 400 | リクエストバリデーション失敗 |
| `UNAUTHORIZED` | 401 | 認証が必要 |
| `FORBIDDEN` | 403 | 権限不足 |
| `NOT_FOUND` | 404 | リソースが見つからない |
| `CONFLICT` | 409 | 状態遷移エラー |
| `INTERNAL_ERROR` | 500 | サーバー内部エラー |

---

## バージョニング

### Research のバージョン

- `versionIds` 配列で過去バージョン ID を保持
- 最新版は `GET /research/{humId}` で取得
- バージョン一覧は `GET /research/{humId}/versions` で取得
- 新バージョン作成は `POST /research/{humId}/versions`

### Dataset のバージョン

- Research と同様のパターン
- Dataset 自体は Research に紐付く形で公開状態を継承

### バージョン番号

- フォーマット: `v1`, `v2`, `v3`, ...
- 単調増加
- 削除・巻き戻しは不可

---

## 実装ファイル

| ファイル | 説明 |
|----------|------|
| `src/api/types.ts` | API 型定義（Es*Schema, クエリ, レスポンス） |
| `src/api/es-client.ts` | Elasticsearch クライアント、検索関数 |
| `src/api/middleware/auth.ts` | Keycloak JWT 検証ミドルウェア |
| `src/api/routes/research.ts` | Research エンドポイント |
| `src/api/routes/dataset.ts` | Dataset エンドポイント |
| `src/api/routes/admin.ts` | 管理者エンドポイント |
| `src/api/routes/health.ts` | ヘルスチェック |
| `src/api/routes/users.ts` | ユーザー関連 |
| `src/api/routes/errors.ts` | エラーレスポンス定義 |
| `src/api/app.ts` | アプリケーション初期化 |

### es-client.ts の主要関数

| 関数 | 説明 |
|------|------|
| `searchResearches` | Research 検索（Dataset 属性フィルタ対応） |
| `searchDatasets` | Dataset 検索（ファセット集計対応） |
| `getResearchDoc` | Research ドキュメント取得 |
| `getResearchDetail` | Research 詳細（Dataset 埋め込み）取得 |
| `getResearchVersion` | ResearchVersion 取得 |
| `listResearchVersionsSorted` | バージョン一覧（降順） |
| `getDataset` | Dataset 取得 |
| `listDatasetVersions` | Dataset バージョン一覧 |

---

## 検証方法

```bash
# TypeScript/Lint チェック
bun run typecheck && bun run lint

# 開発サーバー起動
bun run dev
# http://localhost:8080/docs で OpenAPI UI 確認

# 検索動作確認
curl "http://localhost:8080/research?q=cancer&includeFacets=true"
curl "http://localhost:8080/dataset?assayType=RNA-seq&criteria=Unrestricted-access"
curl "http://localhost:8080/research?assayType=RNA-seq&hasHealthyControl=true"
```
