# アーキテクチャ

HumanDBs Backend の設計思想と設計判断をまとめたドキュメント。

ES スキーマの設計判断は [data-model.md](data-model.md) を参照。

## リソース関係

```plaintext
Research 1:N ResearchVersion
Research 1:N Dataset
ResearchVersion N:M Dataset (datasets で参照)
```

### Research と Dataset の関係

- **1:N の関係**: 1つの Dataset は1つの Research のみに所属
- **Dataset.humId**: 親 Research の humId を保持
- **ライフサイクル連動**: Research 削除時、紐づく Dataset も自動削除される
- **ResearchVersion.datasets**: そのバージョン時点で紐づく Dataset の ID とバージョンの配列
- **作成方法**: Dataset は単体では作成できない。必ず `POST /research/{humId}/dataset/new` で親 Research を指定して作成する

### Dataset の status 依存

Dataset 自体は status フィールドを持たない。親 Research の status に完全依存する。

| 親 Research の status | Dataset の可視性 | Dataset の操作 |
|----------------------|-----------------|---------------|
| draft | 非公開（authenticated/admin のみ） | 作成・更新・削除 可能 |
| review | 非公開（authenticated/admin のみ） | 作成・更新・削除 不可 |
| published | 公開 | 作成・更新・削除 不可 |
| deleted | 非公開（アクセス不可） | N/A |

**重要**: Dataset の作成・更新・削除は、親 Research が **draft 状態の場合のみ** 可能。

## 認証・認可

### OIDC 設定

認証は Keycloak (OIDC) を使用し、public client として構成する。環境変数は compose file で環境ごとに設定される（`compose.yml` を参照）。

Keycloak の管理設定は [keycloak-admin.md](../../../docs/keycloak-admin.md) を参照。

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

### 認可レベル

| レベル | 説明 | アクセス範囲 |
|--------|------|-------------|
| **public** | 認証なし | `status=published` のリソースのみ |
| **authenticated** | 認証あり | public + 自分が `uids` に含まれる Research とその Dataset |
| **admin** | 認証あり + admin リスト | 全リソースアクセス可能、lifecycle 操作可能 |

### status フィルタの権限

| ユーザー種別 | 指定可能な status | 範囲外を指定した場合 |
|-------------|------------------|---------------------|
| public | `published` のみ | 403 Forbidden |
| authenticated | `draft`, `review`, `published`（自分の） | 403 Forbidden |
| admin | `draft`, `review`, `published`, `deleted` | - |

### 認可マトリクス

**Research 操作**:

| 操作 | public | owner | other auth | admin |
|------|--------|-------|------------|-------|
| Read (published) | o | o | o | o |
| Read (draft/review) | x | o | x | o |
| Create | x | x | x | o |
| Update | x | o | x | o |
| Delete | x | x | x | o |
| Submit (draft->review) | x | o | x | o |
| Approve/Reject | x | x | x | o |

**Dataset 操作**（親 Research が draft の場合のみ）:

| 操作 | public | owner | other auth | admin |
|------|--------|-------|------------|-------|
| Read (親が published) | o | o | o | o |
| Read (親が draft/review) | x | o | x | o |
| Create | x | o | x | o |
| Update | x | o | x | o |
| Delete | x | x | x | o |

### Research.uids フィールド

- Keycloak の sub (UUID) の配列
- このリストに含まれるユーザーは、その Research の owner として扱われる
- admin が `PUT /research/{humId}/uids` で設定

### 管理者判定

- JWT claims からの role 抽出は行わない
- 管理者 UID は JSON ファイルで管理（パスは環境変数 `HUMANDBS_BACKEND_ADMIN_UID_FILE` で指定）
- `isAdmin` は API 実行時にこのファイルと照合して決定

## 状態遷移（ワークフロー）

Research のライフサイクル状態遷移を管理する。

### 状態遷移図

```plaintext
POST /research/new (admin)
         |
         v
         +----------+
         |  draft   |<-----------------+
         +----+-----+                  |
              | POST /submit           | POST /reject
              | (authenticated/admin)  | (admin)
              v                        |
         +----------+                  |
         |  review  |------------------+
         +----+-----+                  |
              | POST /approve          |
              | (admin)                |
              v                        |
         +----------+                  |
         |published |------------------+
         +----------+    POST /unpublish (admin)
```

### 状態遷移テーブル

| Action | From | To | 実行者 | 追加処理 |
|--------|------|-----|--------|---------|
| create | - | draft | admin | humId 自動採番（または指定）、`datePublished`/`dateModified` 設定 |
| submit | draft | review | authenticated/admin | `dateModified` 更新 |
| approve | review | published | admin | `dateModified` 更新 |
| reject | review | draft | admin | `dateModified` 更新 |
| unpublish | published | draft | admin | `dateModified` 更新 |

**日付フィールドの意味**:

- `datePublished`: v1 作成時（Research 作成時）に設定され、以後変更されない
- `dateModified`: 状態変更のたびに更新される

### deleted 状態

- `status=deleted` の Research は全ての操作対象外
- API は 404 を返す
- 物理削除ではなく論理削除

## バージョニング

### Research のバージョン

- `versionIds` 配列で過去バージョン ID を保持
- 最新版は `GET /research/{humId}` で取得
- 特定バージョンは `GET /research/{humId}/versions/{version}` で取得
- バージョン一覧は `GET /research/{humId}/versions` で取得
- 新バージョン作成は `POST /research/{humId}/versions/new`

### Dataset のバージョン

Dataset の version は親 Research のライフサイクルと連動して管理される。

**新バージョン作成時のフロー**:

1. `POST /research/{humId}/versions/new` で draft Research を作成
   - 前バージョンの datasets が draft Research の dataset list に自動コピーされる（例: JGAD000001-v1）

2. Dataset の更新 (`PUT /dataset/{datasetId}/update`)
   - 初回更新時: 新しい version（例: JGAD000001-v2）が作成される
   - draft Research の dataset list が自動更新（v1 → v2 に参照変更）
   - 2回目以降の更新: version は上がらず、v2 の中身が上書きされる

3. Dataset の追加 (`POST /research/{humId}/dataset/new`)
   - draft Research の dataset list に自動追加される

4. Dataset の削除 (`POST /dataset/{datasetId}/delete`)
   - draft Research の dataset list から自動削除される

5. `POST /research/{humId}/approve` で公開
   - Dataset の version が確定し、public から見えるようになる

### 「初回更新」の判定

Dataset が「初回更新」かどうかは、ResearchVersion.datasets の参照 version と比較して判定する:

- **初回更新**: Dataset.version == ResearchVersion.datasets[該当datasetId].version → 新 version を作成
- **2回目以降**: Dataset.version != ResearchVersion.datasets[該当datasetId].version → 既存 version を上書き

### バージョン番号

- フォーマット: `v1`, `v2`, `v3`, ...
- 単調増加
- 削除・巻き戻しは不可

## 楽観的ロック

更新系 API では Elasticsearch の楽観的ロック機構を使用し、同時編集の競合を検出する。

### 使用フィールド

- `_seq_no`: Elasticsearch のシーケンス番号
- `_primary_term`: プライマリシャードの世代番号

### 動作

1. GET でリソースを取得すると、レスポンスの `meta` に `_seq_no` と `_primary_term` が含まれる
2. 更新リクエスト（PUT）時に、取得時の値を送信する
3. サーバー側で値を照合し、不一致の場合は `409 Conflict` を返す

## エラーレスポンス

### RFC 7807 Problem Details

エラーレスポンスは [RFC 7807 Problem Details](https://tools.ietf.org/html/rfc7807) 形式を採用する。

```json
{
  "type": "https://humandbs.dbcls.jp/errors/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Research with humId 'hum9999' was not found",
  "instance": "/research/hum9999",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req-abc123"
}
```

### フィールド説明

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `type` | ○ | エラータイプを示す URI |
| `title` | ○ | エラーの簡潔な説明（人間可読） |
| `status` | ○ | HTTP ステータスコード |
| `detail` | △ | エラーの詳細説明 |
| `instance` | △ | 問題が発生したリソースのパス |
| `timestamp` | △ | エラー発生時刻（ISO 8601） |
| `requestId` | △ | リクエスト ID（ログ追跡用） |

### エラータイプ一覧

| type URI | HTTP Status | title | 説明 |
|----------|-------------|-------|------|
| `/errors/validation-error` | 400 | Validation Error | リクエストバリデーション失敗 |
| `/errors/unauthorized` | 401 | Unauthorized | 認証が必要 |
| `/errors/forbidden` | 403 | Forbidden | 権限不足 |
| `/errors/not-found` | 404 | Not Found | リソースが見つからない |
| `/errors/conflict` | 409 | Conflict | 状態遷移エラー、楽観的ロック失敗、重複リソース作成 |
| `/errors/internal-error` | 500 | Internal Server Error | サーバー内部エラー |

### 重複リソース作成の防止

Research や Dataset の作成時、既に同じ ID のリソースが存在する場合は `409 Conflict` を返す。

Elasticsearch の `op_type: "create"` を使用し、ドキュメント存在時にアトミックにエラーを返す。これにより Race condition を含めた重複を完全に防止する。

humId 自動生成時に同時リクエストで同じ ID が生成された場合は、最大 3 回まで新しい ID で自動リトライする。

### requestId によるログ追跡

各リクエストには一意の `requestId` が割り当てられる:

1. クライアントが `X-Request-ID` ヘッダーを送信した場合、その値を使用
2. 送信されない場合、サーバーが UUID を生成

`requestId` はレスポンスヘッダー `X-Request-ID` にも含まれ、サーバーログとの照合に使用できる。

## 型システム設計

### 命名規則

全ての API 型は Zod スキーマで定義し、TypeScript 型は `z.infer<>` で導出する。

| カテゴリ | Zod スキーマ名 | TypeScript 型名 | 例 |
|---------|---------------|-----------------|-----|
| 汎用 | `*Schema` | `*` | `PersonSchema` -> `Person` |
| レスポンス | `*ResponseSchema` | `*Response` | `HealthResponseSchema` -> `HealthResponse` |
| レスポンスメタ | `ResponseMeta*Schema` | `ResponseMeta*` | `ResponseMetaWithLockSchema` -> `ResponseMetaWithLock` |
| パスパラメータ | `*ParamsSchema` | `*Params` | `HumIdParamsSchema` -> `HumIdParams` |
| クエリパラメータ | `*QuerySchema` | `*Query` | `LangQuerySchema` -> `LangQuery` |
| リクエストボディ | `*RequestSchema` | `*Request` | `CreateResearchRequestSchema` -> `CreateResearchRequest` |
| POST 検索ボディ | `*BodySchema` | `*Body` | `ResearchSearchBodySchema` -> `ResearchSearchBody` |
| フィルタ | `*FiltersSchema` | `*Filters` | `DatasetFiltersSchema` -> `DatasetFilters` |

### ファイル配置規則

| ファイル | 内容 |
|---------|------|
| `api/types/common.ts` | 言語タイプ、共通ユーティリティ |
| `api/types/auth.ts` | 認証関連スキーマ |
| `api/types/workflow.ts` | ワークフロー状態 |
| `api/types/facets.ts` | ファセット名、ファセット値スキーマ |
| `api/types/es-docs.ts` | ES ドキュメントスキーマ（es/types からの alias） |
| `api/types/query-params.ts` | クエリパラメータスキーマ |
| `api/types/filters.ts` | 検索フィルタスキーマ |
| `api/types/response.ts` | 統一レスポンス型 (meta, pagination, wrapper factories) |
| `api/types/request-response.ts` | リクエスト/レスポンススキーマ |
| `api/types/index.ts` | バレルファイル（全エクスポート） |

### 注意事項

- **interface 禁止**: 全ての API 型は Zod スキーマで定義。`interface` での定義は避け、`z.infer<>` で導出する
- **utility type**: `TypedFacetsMap` のような utility type は Zod スキーマ化不要
- **後方互換性**: 型の移動時は元のファイルから re-export を維持
- **エクスポート**: `types/shared-types.ts` から frontend に必要な型を re-export
- **依存の方向**: `crawler/types -> es/types -> api/types/` を維持

### 統一レスポンス形式

全ての API レスポンスは統一された形式で返される。

```typescript
// 単一リソース（編集可能）
interface SingleResponse<T> {
  data: T
  meta: {
    requestId: string
    timestamp: string
    _seq_no: number      // 楽観的ロック用
    _primary_term: number
  }
}

// 単一リソース（読み取り専用）
interface SingleReadOnlyResponse<T> {
  data: T
  meta: {
    requestId: string
    timestamp: string
  }
}

// リスト/検索
interface ListResponse<T> {
  data: T[]
  meta: {
    requestId: string
    timestamp: string
    pagination: Pagination
  }
}

interface SearchResponse<T> extends ListResponse<T> {
  facets?: FacetsMap  // includeFacets=true の場合
}
```

### データフロー概要

```plaintext
crawler/types/*.ts (Zod スキーマ = 型の源泉)
         ↓ 型推論
TypeScript 型 (Dataset, Research, etc.)
         ↓
es/*-schema.ts (明示的 ES マッピング)
         ↓
api/types/ (API リクエスト/レスポンス)
         ↓
types/shared-types.ts (Frontend 用 re-export)
```

詳細は [data-model.md](data-model.md) を参照。
