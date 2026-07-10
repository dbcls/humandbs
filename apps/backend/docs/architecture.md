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

Dataset 自体は status フィールドを持たない。親 Research の可視性に依存する。公開判定は `latestVersion != null` で行う。

| 親 Research の状態 | Dataset の可視性 | Dataset の操作 |
|-------------------|-----------------|---------------|
| draft (latestVersion=null) | 非公開（authenticated/admin のみ） | 作成・更新・削除 可能 |
| draft (latestVersion!=null) | 公開版は public 可視、draft 版は非公開 | 作成・更新・削除 可能 |
| review | draft と同じ可視性 | 作成・更新・削除 不可 |
| published | 公開 | 作成・更新・削除 不可 |

**重要**: Dataset の作成・更新・削除は、親 Research が **draft 状態の場合のみ** 可能。

### Dataset 一覧の collapse と日付 sort

Dataset index は **1 (datasetId, version) = 1 doc**。一覧 (`GET /dataset` / `POST /dataset/search` → `searchDatasets`) は `collapse: { field: "datasetId" }` で datasetId ごとに畳み込み、**表示は inner_hits の最新 version** から組み立てる。Elasticsearch の collapse は「外側 sort で先頭に来た doc を group の代表」にするため、**version 可変なフィールドで sort すると asc で破綻する**（asc の代表が最古 version になり、group がその最古日付で並ぶ一方、表示は最新 version の日付になり不整合）。

このため、sort 可能な日付は **version 不変** であること:

- `releaseDate`: 初回公開日。全 version で同一（元から version 不変）。
- `dateModified`: その datasetId の `max(versionReleaseDate)`（= 最新版の release 日付）を全 version doc に denormalize した値。ingest (`es/load-docs.ts § makeDatasetDateModifiedTransform`) で付与し、live の作成・更新・削除経路 (`es-client/dataset.ts § syncDatasetDateModified`) で datasetId 単位に再同期して version 不変を保つ。Research の `dateModified`（1 humId = 1 doc なので collapse 不要）と同じ役割。

version 可変の `versionReleaseDate` は表示専用で、一覧の sort 値には使わない。

## 認証・認可

### OIDC 設定

認証は Keycloak (OIDC) を使用し、public client として構成する。環境変数は compose file で環境ごとに設定される（`compose.yml` を参照）。

Keycloak の管理設定は [keycloak-admin.md](../../../docs/keycloak-admin.md) を参照。

### JWT Claims

認可・業務ロジックでは `sub` (Keycloak の ユーザー UID) のみを利用する。スキーマ (`src/api/types/auth.ts` の `JwtClaimsSchema` / `AuthUserSchema`) には `preferred_username` / `email` も含まれ JWT から抽出されるが、現状コードベース内で参照されていない（将来のロギング / audit 用に保持）。role 系のクレームは抽出しない。

### 認可レベル

| レベル | 説明 | アクセス範囲 |
|--------|------|-------------|
| **public** | 認証なし | [公開条件](#公開条件)を満たすリソースのみ |
| **authenticated** | 認証あり | public + 自分が `uids` に含まれる Research とその Dataset |
| **admin** | 認証あり + admin リスト | 全リソースアクセス可能、lifecycle 操作可能 |

### status フィルタの権限

| ユーザー種別 | 指定可能な status | 範囲外を指定した場合 |
|-------------|------------------|---------------------|
| public | `published` のみ（内部では `latestVersion exists` に変換） | 403 Forbidden |
| authenticated | `draft`, `review`, `published`（非 `published` は自分のリソースのみ） | 403 Forbidden |
| admin | `draft`, `review`, `published` | - |

### 認可マトリクス

**Research 操作**:

| 操作 | public | owner | other auth | admin |
|------|--------|-------|------------|-------|
| Read (latestVersion!=null) | o | o | o | o |
| Read (draft/review) | x | o | x | o |
| Read detail (レスポンス) | status/uids/draftVersion は値ベース制御 | 全フィールド | status/uids/draftVersion は値ベース制御 | 全フィールド |
| Create | x | x | x | o |
| Update | x | o | x | o |
| Delete | x | x | x | o |
| Submit (draft->review) | x | o | x | o |
| Approve/Reject | x | x | x | o |

**Dataset 操作**（親 Research が draft の場合のみ）:

| 操作 | public | owner | other auth | admin |
|------|--------|-------|------------|-------|
| Read (親が latestVersion!=null) | o | o | o | o |
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

#### 初回フロー

```plaintext
[create] -----> draft     (latest=null, draft=v1)
-> [submit]  -> review    (latest=null, draft=v1)
-> [approve] -> published (latest=v1, draft=null)
-> [reject]  -> draft     (latest=null, draft=v1)
```

#### 新バージョン追加フロー

```plaintext
[versions/new] -> draft     (latest=v1, draft=v2)
-> [submit]    -> review    (latest=v1, draft=v2)
-> [approve]   -> published (latest=v2, draft=null)
-> [reject]    -> draft     (latest=v1, draft=v2)
```

#### 非公開化

```plaintext
[unpublish] → draft (latest=null, draft=<元の latest>)
```

#### パッチ（公開済の軽微修正）

```plaintext
[patch] → published (latest=v1, draft=null)  ※ 状態・バージョン不変、内容のみ更新
```

### 状態遷移テーブル

| Action | From | To | latestVersion | draftVersion | 実行者 | 追加処理 |
|--------|------|-----|---------------|--------------|--------|---------|
| create | - | draft | null | v1 | admin | humId 自動採番（または指定）、`dateModified` 設定 |
| submit | draft | review | 変更なし | 変更なし | owner/admin | `dateModified` 更新 |
| approve | review | published | = draftVersion | null | admin | `dateModified` 更新、`datePublished` が null なら設定 |
| reject | review | draft | 変更なし | 変更なし | admin | `dateModified` 更新 |
| unpublish | published | draft | null | = 元の latestVersion | admin | `dateModified` 更新 |
| versions/new | published | draft | 変更なし | 新バージョン | owner/admin | `dateModified` 更新 |
| patch | published | published | 変更なし | 変更なし | owner/admin | 同一バージョンの内容を直接修正、`dateModified` 更新 |

**日付フィールドの意味**:

- `datePublished`: 初回 approve 時に設定され、以後変更されない。作成時は null
- `dateModified`: 状態変更、通常の更新（`PUT /research/{humId}/update`）、パッチ（`PUT /research/{humId}/patch`）のたびに更新される

### 削除

Research の削除は物理削除で行う。`POST /research/{humId}/delete` (admin only) は Research ドキュメント、全 ResearchVersion、全紐づき Dataset を物理的に削除する。削除後は同じ humId で再作成が可能。

## 公開判定（Public Visibility）

Research が public API（認証なし）で見えるかどうかと、どのバージョンが返るかを定めるルール。

### 公開条件

```
latestVersion != null
```

この条件を満たす Research とその Dataset が、認証なしの public API で閲覧できる。

### 状態・バージョンと公開の関係

| status | latestVersion | draftVersion | public に見える？ | 見えるバージョン |
|--------|---------------|--------------|-------------------|------------------|
| draft | null | v1 | No | - |
| review | null | v1 | No | - |
| published | v1 | null | Yes | v1 |
| draft | v1 | v2 | Yes | v1 |
| review | v1 | v2 | Yes | v1 |
| published | v2 | null | Yes | v2 |

v2 を編集中（draft/review）でも、`latestVersion` が v1 なら public API には v1 が返り続ける。

### バージョン解決ルール

#### 詳細取得（`GET /research/{humId}`）

version 未指定時:

| ユーザー種別 | 解決ルール |
|-------------|-----------|
| public | `latestVersion`（公開版） |
| authenticated (非オーナー) | `latestVersion`（公開版） |
| owner/admin | `draftVersion ?? latestVersion`（編集版優先） |

`?version=vN` でバージョン直接指定時:

| ユーザー種別 | 制約 |
|-------------|------|
| public | `latestVersion` の番号以下のみ許可（範囲外は 404） |
| authenticated (非オーナー) | `latestVersion` の番号以下のみ許可（範囲外は 404） |
| owner/admin | 全バージョンアクセス可能 |

#### バージョン一覧（`GET /research/{humId}/versions`）

| ユーザー種別 | 返却範囲 |
|-------------|---------|
| public | `latestVersion` 以下のバージョンのみ |
| authenticated (非オーナー) | `latestVersion` 以下のバージョンのみ |
| owner/admin | 全バージョン |

#### 検索・一覧（`GET /research`, `POST /research/search`）

ResearchSummary に含まれるバージョン情報と Dataset メタデータ:

| ユーザー種別 | 使用するバージョン |
|-------------|-------------------|
| public | `latestVersion` 以下のバージョンのみ |
| authenticated (非オーナー) | `latestVersion` 以下のバージョンのみ |
| owner/admin | 全バージョン |

`versions`, `datasetIds`, `typeOfData`, `platforms` 等は、上記で許可されたバージョンに紐づくデータのみ集計する。

ResearchSummary の `methodsSummary` / `typeOfDataSummary` / `targetsSummary` は、Joomla 旧サイト一覧 article から取り込んだ短文要約（各 `BilingualText = {ja, en}`）。詳細ページ本文由来の `methods` / `typeOfData` / `targets`（長文）と並列で配信し、一覧 UI ではこちらを表示する想定。Joomla 一覧に未掲載の humId は `null` を返す。全文検索（`all_text`）には流さず、表示専用とする。

### レスポンスのフィールド制御

Research のレスポンスは「詳細 (`GET /research/{humId}`, `GET /research/{humId}/versions/{v}`)」と「一覧／検索 (`GET /research`, `POST /research/search`)」で別シェイプを返す。

#### 全ユーザー共通で除外

| 除外フィールド | 理由 |
|---------------|------|
| `versionIds` | 内部メタデータ。API では `versions` エンドポイントで取得する |

#### 詳細レスポンス: 値ベースの制御

詳細では `status`, `uids`, `draftVersion`, `latestVersion` を **常にフィールドとして含める**。型を統一し、ユーザー種別に応じて値を制御する:

| フィールド | owner/admin | その他（public 含む） |
|-----------|-------------|---------------------|
| `status` | 実際の値 | `"published"` |
| `uids` | 実際の値 | `[]` |
| `draftVersion` | 実際の値 | `null` |
| `latestVersion` | 実際の値 | 実際の値（公開判定後なので非 null 保証） |

詳細レスポンスは `_seq_no` / `_primary_term` をトップレベル `meta` に含める（楽観的ロック用、Dataset と統一）。

#### 一覧レスポンス: 値+省略のミックス

一覧 / 検索の `data[]` 各 item は `ResearchSummary` シェイプで返す。`status` は値ベース制御だが、`uids` / `draftVersion` / `latestVersion` はレスポンスから **omit** する:

| フィールド | owner/admin | その他（public 含む） |
|-----------|-------------|---------------------|
| `status` | 実際の値 | `"published"` |
| `uids` | omit | omit |
| `draftVersion` | omit | omit |
| `latestVersion` | omit | omit |

一覧レスポンスは item 単位の `_seq_no` / `_primary_term` を含めない（必要なら詳細を再取得する）。

frontend は「一覧 → 詳細」の 2 段フェッチで運用する。一覧レスポンスは軽量に保ち、編集に必要なメタデータ（`uids` / `draftVersion` / 楽観的ロック値）は詳細でのみ提供する。

#### Bulk 取得レスポンス: 詳細と同じ値ベース制御

`GET /dataset/batch` / `GET /research/batch`（複数 ID を一括取得）は詳細と同じ item シェイプを返す。research の値ベース制御（`status` / `uids` / `draftVersion` の伏せ）も詳細と **同一ロジック**（`utils/version.ts § sanitizeResearchDetailForUser`）を共有し、単一詳細と batch でズレないようにしている。見つからない ID とアクセス不可 ID は区別せず `meta.batch.notFound` に集約し存在を秘匿する。一覧と同様、item 単位の `_seq_no` / `_primary_term` は含めない。

## バージョニング

### Research のバージョン

- `versionIds` 配列で全バージョン ID を保持
- `latestVersion`: 公開中のバージョン（null = 未公開）
- `draftVersion`: 編集中のバージョン（null = 編集なし）
- 最新版は `GET /research/{humId}` で取得
- 特定バージョンは `GET /research/{humId}/versions/{version}` で取得
- バージョン一覧は `GET /research/{humId}/versions` で取得
- 新バージョン作成は `POST /research/{humId}/versions/new`（published 状態のみ）

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
   - `datasetId` を明示指定した場合、既存 datasetId（別 Research 配下を含む）との衝突は `409 Conflict` で拒否される（[Dataset ID の一意性](#datasetid-の一意性)）

4. Dataset の削除 (`POST /dataset/{datasetId}/delete`)
   - draft Research の dataset list から自動削除される

5. `POST /research/{humId}/approve` で公開
   - Dataset の version が確定し、public から見えるようになる

### 「初回更新」の判定

Dataset が「初回更新」かどうかは、**親 Research の `latestVersion` 対応 ResearchVersion** の `datasets` 配列を参照して判定する。これは前 cycle で公開された version (pin 済) かどうかを確認するため。

- **初回更新**: Dataset.version == 親 `latestVersion` ResearchVersion.datasets[該当datasetId].version → 新 version を作成し、親 `draftVersion` ResearchVersion.datasets の参照を新 version に張り替える
- **2回目以降**: Dataset.version != 親 `latestVersion` ResearchVersion.datasets[該当datasetId].version (= draft cycle 中に既に bump 済) → 既存 version を上書き
- **初回 draft cycle (親 `latestVersion` == null)** または **draft cycle 中に新規追加された Dataset** (親 `latestVersion` ResearchVersion.datasets に entry なし) → bump 不要、既存 version を上書き

### Dataset のバージョン解決

`PUT /dataset/{datasetId}/update` は `?version=v<N>` で対象 version を指定する。`loadDatasetAndAuthorize` ミドルウェアは validators の **前** に動き、以下の順で version を解決する:

1. `?version=` が `^v\d+$` にマッチ → その値を採用
2. `?version=` が欠落 / 不正フォーマット → ES の **数値降順 sort** (`Integer.parseInt(version.substring(1))`) で最大版を採用
3. 該当 datasetId の document が 1 件も無い → 404

このフォールバックは「draft cycle 中の初回 PUT で内部的に v1→v2 に bump された直後にクライアントが `?version=` を付け忘れた場合でも最新版を編集対象にする」ためのもので、authz は version 解決の **後** に動く（owner / parent-draft 判定は解決済み Dataset の親 Research を元に評価される）。

sort は Painless ベースの数値比較（`query-builders.ts:versionSortSpec`）なので `v10 > v9` が成立し、辞書順 (`v10 < v9`) のバグは発生しない。

### datasetId の一意性

`datasetId` は Elasticsearch dataset index 全体で unique。作成 endpoint (`POST /research/{humId}/dataset/new`) は client 指定の datasetId が既存の場合、handler で `resolveLatestDatasetVersion` を用いて事前検知し、`ConflictError.forDuplicate("Dataset", datasetId)` を返して create 自体を拒否する（`routes/research/datasets.ts`）。これは以下の破壊シナリオを塞ぐため:

- **同 Research 内で既存 datasetId 指定**: `getNextDatasetVersion` が `v(N+1)` を採番して新 doc を作り、UI 上の「最新版」表示が新 v(N+1) に切り替わって旧 v1 で入力した内容が見えなくなる
- **別 Research から既存 datasetId 指定**: `linkDatasetToResearch` が無条件に呼び出し先 Research の datasets 配列に新 version を張るため、1 つの datasetId が複数 Research 配下に跨って参照される 1:N 関係破壊が発生する

version bump 経路（`bumpDatasetVersion`）は published 済み Research の draft cycle 中の初回更新でのみ発火するため、この保護は作成 endpoint に閉じる。

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

全ての API 型は Zod スキーマで定義し、TypeScript 型は `z.infer<>` で導出する。`interface` での定義は禁止。

| カテゴリ | Zod スキーマ名 | TypeScript 型名 |
|---------|---------------|-----------------|
| 汎用 | `*Schema` | `*` |
| レスポンス | `*ResponseSchema` | `*Response` |
| レスポンスメタ | `ResponseMeta*Schema` | `ResponseMeta*` |
| パスパラメータ | `*ParamsSchema` | `*Params` |
| クエリパラメータ | `*QuerySchema` | `*Query` |
| リクエストボディ | `*RequestSchema` | `*Request` |
| POST 検索ボディ | `*BodySchema` | `*Body` |
| フィルタ | `*FiltersSchema` | `*Filters` |

ファイル単位の役割分担は `src/api/types/` 配下のファイル名と各ファイル冒頭のコメントを参照。

### 規約

- **依存方向**: `crawler/types → es/types → api/types/` の片方向のみ。逆方向の import は禁止
- **SSOT**: `LangType` / `LANG_TYPES` は `crawler/types/common.ts` を SSOT として、`es/types` / `api/types/common.ts` から re-export する
- **API 固有スキーマの prefix**: API リクエスト用の Dataset 型は `ApiDatasetSchema`。Crawler の `DatasetSchema` と区別する
- **frontend 向け export**: `types/shared-types.ts` から re-export する。`Es` prefix なしの clean name のみ (例: `DatasetDoc`, `ResearchDetail`, `Person`)

### 統一レスポンス形式

全ての API レスポンスは `data` + `meta` の統一形式で返す。詳細スキーマは `src/api/types/response.ts` を参照。

| 形式 | 用途 | `meta` に含まれる主なフィールド |
|---|---|---|
| `SingleResponse<T>` | 編集可能な単一リソース | `requestId`, `timestamp`, `_seq_no`, `_primary_term` (楽観的ロック) |
| `SingleReadOnlyResponse<T>` | 読み取り専用の単一リソース | `requestId`, `timestamp` |
| `ListResponse<T>` | 一覧 | `requestId`, `timestamp`, `pagination` |
| `SearchResponse<T>` | 検索 (= ListResponse) | `pagination` に加え、`includeFacets=true` のとき `facets` |

### データフロー概要

`crawler/types → es/types → api/types → shared-types` の方向で型が伝搬する。詳細は [data-model.md § 型の変換フロー](data-model.md#型の変換フロー) を参照。
