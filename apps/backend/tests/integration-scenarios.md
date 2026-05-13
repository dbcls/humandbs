# Integration テストシナリオ

実 Elasticsearch (場合により JGA PostgreSQL / staging Keycloak) に対する E2E 検証シナリオの一覧。各シナリオは「これが落ちたらどんなバグが検出されたことになるか」に答えられる粒度で書く。

このファイルは **シナリオ列挙の SSOT**。

- 具体的なテストコード: `tests/integration/api/*.test.ts`
- 運用ノート (環境変数・fixture 戦略・件数 drift 対策・JGA 分離・CI): [integration-note.md](integration-note.md)
- テスト方針 (TDD・命名・Mock 戦略・回帰テスト): [testing.md](testing.md)

mutating IT (research / dataset / workflow / version) は `tests/integration/api/mutating-helpers.ts` の共通ヘルパー (create / set uids / submit / approve / reject / unpublish / createDataset / createNewVersion / purge) を経由して isolation ES index 上で実行する。

## ID 体系

`IT-{機能}-{連番 2 桁}` の形式で振る。例: `IT-AUTH-03`, `IT-RESEARCH-12`, `IT-WORKFLOW-05`。

- 機能ごとに連番をリセット
- 削除したシナリオの ID は **再利用しない** (履歴互換性)
- 機能名は固定リスト (下記カテゴリ): `CORE` / `HEALTH` / `STATS` / `ERROR` / `AUTH` / `FACETS` / `SEARCH` / `DATASET` / `RESEARCH` / `WORKFLOW` / `VERSION` / `JGA` / `ADMIN`
- IT 1 件 = test 関数 1 件 (parametrize で複数ケースを 1 関数に展開してよい)
- test 関数の冒頭コメントに `IT-XXX-NN` を明記して双方向にトレース可能にする

## シナリオテンプレート

各シナリオは以下 4 項目で記述する。**件数の実測値は書かない** (構造的不変条件のみ。書き方は [integration-note.md § 件数 drift 対策](integration-note.md#件数-drift-対策))。

```markdown
### IT-XXX-NN: <短いタイトル>

**endpoint**: HTTP method + path + 主要パラメータ

**不変条件**:
- 構造的に守るべき条件 1
- 構造的に守るべき条件 2

**回帰元**: 仕様根拠 (`docs/api-guide.md § ...` / `docs/architecture.md § ...`)

**関連 unit テスト**: SSOT としての unit ファイル (path、必要なら `path::describe-name`)
```

## 観点 matrix (網羅チェック用)

各カテゴリ内で以下の観点を機械的に確認する。endpoint × 観点が成立する組み合わせは原則 1 IT 以上書く (該当しない組み合わせは省略してよいが、その判断はカテゴリ冒頭で明示する)。

| 観点 | 内容 | 主な対象カテゴリ |
|---|---|---|
| 正常系 | 主要パス、各メソッドの基本動作、レスポンス shape | 全カテゴリ |
| 境界値 | ページネーション境界 (`page=1`, `limit=100`, `limit=101`)、version 解決の境界、文字列長 | SEARCH / DATASET / RESEARCH / VERSION |
| 異常系 | 422/400/401/403/404/409/500 の RFC 7807 形式、不正パラメータ、不正 body | 全カテゴリ |
| 認可 | public/authenticated (owner) /authenticated (non-owner) /admin の差、`uids` 反映 | AUTH / DATASET / RESEARCH / WORKFLOW / JGA / ADMIN |
| status filter | `draft` / `review` / `published` / `deleted` の可視性、status クエリの権限 | SEARCH / DATASET / RESEARCH |
| 楽観的ロック | `_seq_no` / `_primary_term` 不一致で 409 | RESEARCH / DATASET / VERSION |
| 外部依存 | JGA PostgreSQL / Keycloak への接続必須シナリオの分離 | JGA / AUTH |

## カテゴリ別の補足

### 件数 drift 対策の前提

下記カテゴリで `total` や `items.length` を assert する場合は、固定値ではなく [integration-note.md § 件数 drift 対策](integration-note.md#件数-drift-対策) のパターンを使う。

### JGA / Keycloak の前提

JGA 関連 (`IT-JGA-*`) は staging PostgreSQL と staging Keycloak admin トークンに依存する。接続不可時は session skip。詳細は [integration-note.md § JGA / staging 専用シナリオ](integration-note.md#jga--staging-専用シナリオ)。

---

## IT-CORE-*: 共通仕様

全 endpoint 横断の HTTP レベル不変条件。代表 endpoint で 1 度通れば全体が守られる前提 (`requestIdMiddleware` / `cors()` / `onError` で集約)。

### IT-CORE-01: X-Request-ID をリクエストヘッダーで指定すれば echo される

**endpoint**: `GET /health` (代表)

**不変条件**:
- リクエストヘッダー `X-Request-ID: <任意文字列>` 指定時、レスポンスヘッダー `X-Request-ID` に同値が入る
- 同じ ID で 2 回叩いても両方とも同じ値が echo される (キャッシュや書き換えがない)

**回帰元**: `docs/api-guide.md § エラーレスポンス § requestId によるログ追跡` / `architecture.md § エラーレスポンス`

**関連 unit テスト**: `tests/unit/api/middleware/request-id.test.ts`

### IT-CORE-02: X-Request-ID 未指定時は UUID v4 が自動生成される

**endpoint**: `GET /health`

**不変条件**:
- リクエストに `X-Request-ID` が無い場合、レスポンスヘッダーに UUID v4 形式の文字列が入る
- 同一エンドポイントを 2 回叩くと毎回別の値になる (キャッシュされない)
- エラーレスポンス body の `requestId` フィールドにも同じ値が入る (確認は IT-ERROR-* と兼ねる)

**回帰元**: `docs/api-guide.md § エラーレスポンス § requestId によるログ追跡`

**関連 unit テスト**: `tests/unit/api/middleware/request-id.test.ts`

### IT-CORE-03: CORS ヘッダーが全 endpoint で `*`

**endpoint**: 任意 (代表として `GET /health`)

**不変条件**:
- 通常リクエストのレスポンスに `Access-Control-Allow-Origin: *`
- preflight (`OPTIONS`) でも同じヘッダーが返る

**回帰元**: `app.ts` の `cors()` middleware 適用

**関連 unit テスト**: なし (Hono `cors()` の挙動に依存)

### IT-CORE-04: URL prefix 適用の整合性

**endpoint**: `GET /health` および `GET ${HUMANDBS_BACKEND_URL_PREFIX}/health`

**不変条件**:
- `HUMANDBS_BACKEND_URL_PREFIX` が設定されている環境 (compose: `/api`) では prefix 付きパスが 200 を返す
- prefix なしパス (例: `/health`) は同環境では到達できない (404)
- prefix 未設定環境ではその逆

**回帰元**: `app.ts` の URL_PREFIX 分岐

**関連 unit テスト**: なし (compose 環境固有)

### IT-CORE-05: 不在 endpoint は 404 + RFC 7807

**endpoint**: `GET /__not_a_route__`

**不変条件**:
- `status === 404`
- body は IT-ERROR-01 と同じ RFC 7807 形式
- `instance` が叩いたパスを示す

**回帰元**: `app.ts` の `onError` フォールバック

**関連 unit テスト**: なし (Hono デフォルトの 404 ハンドラに依存)

### IT-CORE-06: 許可されていない HTTP メソッドは 405 (or 404) + RFC 7807

**endpoint**: `DELETE /health` (GET 専用 endpoint に DELETE)

**不変条件**:
- `status === 405` または `404` (Hono のルーター挙動次第で確定)
- RFC 7807 形式 (`type`, `title`, `status`)
- レスポンスヘッダーに `X-Request-ID` が echo される

**回帰元**: `app.ts § onError`

**関連 unit テスト**: なし

---

## IT-HEALTH-*: ヘルスチェック

`GET /health` (`src/api/routes/health.ts`)。ES への問い合わせは行わない単純応答。

### IT-HEALTH-01: 正常応答

**endpoint**: `GET /health`

**不変条件**:
- `status === 200`
- body は `{ status: "ok", timestamp: <ISO 8601 string> }`
- `Content-Type: application/json`
- 認証なしで 200 が返る
- `timestamp` を `new Date()` でパースしたとき NaN にならず、現在時刻から ±60 秒以内

**回帰元**: `docs/api-guide.md § その他 (Health)` / `src/api/routes/health.ts`

**関連 unit テスト**: `tests/unit/api/routes/health.test.ts`

### IT-HEALTH-02: ES が落ちていても応答する

**endpoint**: `GET /health`

**不変条件**:
- ES が unreachable な状態でも `200` を返す (ES に問い合わせていない)
- > 注: 検証手段が要る場合は `HUMANDBS_ES_HOST` を `localhost:1` 等で起動する別プロセスで確認。通常の integration 実行では skip してよい

**回帰元**: `architecture.md § ヘルスチェック方針`

**関連 unit テスト**: `tests/unit/api/routes/health.test.ts`

---

## IT-STATS-*: 統計情報

`GET /stats` (`src/api/routes/stats.ts`)。published Research と紐づく Dataset のみを対象に、totals + 全 18 ファセットの research/dataset cardinality を返す。認証不要。

### IT-STATS-01: 正常応答 (公開リソース集計)

**endpoint**: `GET /stats`

**不変条件**:
- `status === 200`
- body は `SingleReadOnlyResponse<StatsResponse>` 形式: `data`, `meta.requestId`, `meta.timestamp`
- `data.research.total: number >= 0`
- `data.dataset.total: number >= 0`
- `data.facets` は object
- 認証なしで取得できる (`/stats` は public)

**回帰元**: `docs/api-guide.md § Stats API`

**関連 unit テスト**: `tests/unit/api/routes/stats.test.ts`

### IT-STATS-02: ファセット内訳に research/dataset breakdown を含む

**endpoint**: `GET /stats`

**不変条件**:
- `data.facets` の各 key (例: `assayType`, `tissues`, `disease` 等) の値は `{ [bucketKey]: { research: number, dataset: number } }` 形式
- 任意のファセットで `research <= data.research.total` かつ `dataset <= data.dataset.total`
- platform の bucketKey は `"<vendor>||<model>"` 形式 (`||` を含む)

**回帰元**: `src/api/routes/stats.ts § buildStatsAggregations / extractStatsFacets`

**関連 unit テスト**: `tests/unit/api/routes/stats.test.ts`

### IT-STATS-03: published が 0 件のときも壊れず返す

**endpoint**: `GET /stats` (公開 Research が無いインデックス状態を想定)

**不変条件**:
- `status === 200`
- `data.research.total === 0` かつ `data.dataset.total === 0`
- `data.facets` は `{}` または各 key が空 object
- > 注: 通常の integration 環境ではデータがあるため skip。空 ES を用意できた時のみ実行

**回帰元**: `src/api/routes/stats.ts` の 0 件分岐 (publishedHumIds が空配列)

**関連 unit テスト**: `tests/unit/api/routes/stats.test.ts`

### IT-STATS-04: 含まれるファセット key の集合

**endpoint**: `GET /stats`

**不変条件**:
- `Object.keys(data.facets)` は次のいずれかの key を **含む** (drift 耐性のため superset/subset で確認): `criteria`, `assayType`, `tissues`, `population`, `platform`, `fileTypes`, `healthStatus`, `subjectCountType`, `isTumor`, `cellLine`, `sex`, `ageGroup`, `libraryKits`, `readType`, `referenceGenome`, `processedDataTypes`, `hasPhenotypeData`, `disease`, `diseaseIcd10`, `policyId`
- `total_research` / `total_dataset` は facets に含まれない (extractStatsFacets で skip 済み)

**回帰元**: `src/api/routes/stats.ts § buildStatsAggregations`

**関連 unit テスト**: `tests/unit/api/routes/stats.test.ts`

### IT-STATS-05: ES 接続不可なら 500 + RFC 7807

**endpoint**: `GET /stats` (ES を停止/到達不能にした状態)

**不変条件**:
- `status === 500`
- IT-ERROR-01 と同じ RFC 7807 形式、`type === ".../internal-error"`
- `instance` がリクエストパスと一致
- > 注: 通常の integration では再現困難。`HUMANDBS_ES_HOST` を到達不能な値に差し替えた別プロセス、または mock した unit で網羅

**回帰元**: `app.ts § onError` (未捕捉エラーの 500 分岐)

**関連 unit テスト**: なし

---

## IT-ERROR-*: エラーハンドラ

`app.ts` の `onError` (RFC 7807 形式生成)、`HTTPException`、ES `version_conflict` の 409 自動変換、未捕捉エラーの 500。

### IT-ERROR-01: 404 が RFC 7807 Problem Details 形式

**endpoint**: `GET /research/__does_not_exist__`

**不変条件**:
- `status === 404`
- レスポンスヘッダー `Content-Type: application/problem+json` (RFC 7807)
- body に必須キー `type`, `title`, `status`, `timestamp` が存在
- `type === "https://humandbs.dbcls.jp/errors/not-found"`
- `title === "Not Found"`
- `status === 404`
- `instance` がリクエストパスと一致
- `requestId` が存在し、レスポンスヘッダー `X-Request-ID` と一致

**回帰元**: `docs/api-guide.md § エラーレスポンス` / `src/api/errors/index.ts § ERROR_TYPE_URIS` / `src/api/app.ts § onError`

**関連 unit テスト**: `tests/unit/api/errors/index.test.ts`

### IT-ERROR-02: 400 が RFC 7807 形式 (バリデーション)

**endpoint**: `GET /research?page=0`

**不変条件**:
- `status === 400`
- `type === ".../validation-error"`、`title === "Validation Error"`、`status === 400`
- IT-ERROR-01 と同じ必須キーが存在

**回帰元**: `docs/api-guide.md § ページネーション`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts` (validation セクション)

### IT-ERROR-03: 401 が RFC 7807 形式 (未認証)

**endpoint**: `POST /research/new` (body 空、`Authorization` ヘッダーなし)

**不変条件**:
- `status === 401`
- `type === ".../unauthorized"`、`title === "Unauthorized"`、`status === 401`

**回帰元**: `architecture.md § 認可マトリクス § Research 操作 Create`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts` (auth セクション)

### IT-ERROR-04: 403 が RFC 7807 形式 (admin 限定 endpoint に非 admin)

**endpoint**: `POST /research/{published_humId}/approve` (authenticated だが非 admin)

**不変条件**:
- `status === 403`
- `type === ".../forbidden"`、`title === "Forbidden"`、`status === 403`

**回帰元**: `architecture.md § 認可マトリクス § Approve/Reject`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-ERROR-05: 409 が RFC 7807 形式 (楽観的ロック失敗)

**endpoint**: `PUT /research/{humId}/update` (古い `_seq_no` / `_primary_term` を送る)

**不変条件**:
- `status === 409`
- `type === ".../conflict"`、`title === "Conflict"`、`status === 409`
- `detail` に競合内容が示される

**回帰元**: `docs/api-guide.md § 楽観的ロックの使い方` / `architecture.md § 楽観的ロック`

**関連 unit テスト**: `tests/unit/api/es-client/research-delete.test.ts` (周辺)

### IT-ERROR-06: 重複作成も 409 (op_type: create)

**endpoint**: `POST /research/new` (admin、すでに存在する `humId` を body で指定)

**不変条件**:
- `status === 409`
- `type === ".../conflict"`、`detail` に「already exists」相当の文言

**回帰元**: `architecture.md § 重複リソース作成の防止`

**関連 unit テスト**: `tests/unit/api/es-client/research.test.ts`

### IT-ERROR-07: 削除済み Research へのアクセスは 404 (情報漏洩防止)

**endpoint**: `GET /research/{deleted_humId}` (status=deleted)

**不変条件**:
- public/authenticated (非 owner): `status === 404`
- 存在しない humId と同じ shape のエラー body (`detail` を含めて区別不能)

**回帰元**: `architecture.md § deleted 状態` / `architecture.md § 公開判定`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-ERROR-08: エラーレスポンスの timestamp が ISO 8601

**endpoint**: 任意のエラー (代表として IT-ERROR-01)

**不変条件**:
- `timestamp` を `new Date()` でパース可能、`Date.parse()` で `NaN` にならない
- 現在時刻から ±60 秒以内

**回帰元**: `docs/api-guide.md § エラーレスポンス`

**関連 unit テスト**: `tests/unit/api/errors/index.test.ts`

---

## IT-AUTH-*: 認証・認可

Keycloak Bearer 認証、`optionalAuth` / `requireAuth` / `requireAdmin`、`loadResearchAndAuthorize` (`requireOwnership` / `adminOnly`)、`isAdminUser` (admin\_uids.json)、JWKS rotation、JWT 期限切れ、claim 不正。

> staging Keycloak の credential を使う。トークン取得不可なら IT-AUTH-* は全て skip。詳細は [integration-note.md § Keycloak](integration-note.md#keycloak-oidc) 参照。

### IT-AUTH-01: Bearer なしで admin 必須 endpoint は 401

**endpoint**: `POST /research/new` (Authorization なし)

**不変条件**:
- `status === 401`
- `title === "Unauthorized"`、IT-ERROR-03 と同じ RFC 7807 形式

**回帰元**: `architecture.md § 認可マトリクス § Research Create`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

### IT-AUTH-02: Bearer なしで optionalAuth endpoint は 200 (public 範囲)

**endpoint**: `GET /research` (Authorization なし)

**不変条件**:
- `status === 200`
- `data` 配列に含まれる Research は全て `latestVersion !== null` かつ `status !== "deleted"`
- 各 item の `status` フィールドの値は `"published"` (value-based field control)
- 各 item で `uids` / `draftVersion` / `latestVersion` は **omit** (list shape `ResearchSummary`)

**回帰元**: `architecture.md § 公開条件` / `architecture.md § レスポンスのフィールド制御`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-AUTH-03: 壊れた Bearer は 401

**endpoint**: `GET /admin/is-admin` (`Authorization: Bearer not.a.valid.jwt`)

**不変条件**:
- `status === 401`
- `title === "Unauthorized"`、`detail` に「Invalid or expired token」相当

**回帰元**: `architecture.md § JWT Claims`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

### IT-AUTH-04: 期限切れ JWT は 401

**endpoint**: 任意の `requireAuth` endpoint

**不変条件**:
- `status === 401`
- ログには「JWT token expired」相当のメッセージが出る (確認は別途)

**回帰元**: `middleware/auth.ts § verifyToken § JWTExpired`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

### IT-AUTH-05: 別 issuer の JWT は 401

**endpoint**: 任意の `requireAuth` endpoint (issuer が `HUMANDBS_AUTH_ISSUER_URL` と一致しない JWT)

**不変条件**:
- `status === 401`
- claim validation error として落ちる

**回帰元**: `middleware/auth.ts § jwtVerify { issuer }`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

### IT-AUTH-06: 別 audience の JWT は 401

**endpoint**: 任意の `requireAuth` endpoint (audience が `HUMANDBS_AUTH_CLIENT_ID` と一致しない JWT)

**不変条件**:
- `status === 401`

**回帰元**: `middleware/auth.ts § jwtVerify { audience }`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

### IT-AUTH-07: JWKS rotation 後も認証成功する

**endpoint**: 任意の `requireAuth` endpoint

**不変条件**:
- 古い JWKS cache で署名検証に失敗したとき、cache を clear して新しい JWKS を取得しリトライ、最終的に 200 を返す
- > 注: 検証が難しい場合は unit (Mock) で網羅し、integration では skip

**回帰元**: `middleware/auth.ts § verifyToken § retry on JWKS failure`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

### IT-AUTH-08: admin_uids.json に含まれる sub は admin として扱われる

**endpoint**: `GET /admin/is-admin` (admin token)

**不変条件**:
- `status === 200`
- `data.isAdmin === true`

**回帰元**: `architecture.md § 管理者判定`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

### IT-AUTH-09: admin_uids.json に含まれない sub は非 admin

**endpoint**: `GET /admin/is-admin` (非 admin authenticated token)

**不変条件**:
- `status === 200`
- `data.isAdmin === false`

**回帰元**: `architecture.md § 管理者判定`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

### IT-AUTH-10: admin_uids.json が未設定/不在のとき admin 判定は誰も true にならない

**endpoint**: `GET /admin/is-admin` (`HUMANDBS_BACKEND_ADMIN_UID_FILE` 未設定で起動)

**不変条件**:
- どのトークンでも `data.isAdmin === false`
- ログに warning は出ない (info レベル)、ファイル読み込みエラーで 500 にならない

**回帰元**: `middleware/auth.ts § getAdminUids` の env 未設定 / ENOENT 分岐

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

### IT-AUTH-11: requireOwnership: owner (uids に含まれる) で通る

**endpoint**: `PUT /research/{owned_humId}/update` (owner token)

**不変条件**:
- `status` が 200 (もしくは 400 等、認可は通った状態)
- 401 / 403 は返らない

**回帰元**: `architecture.md § 認可マトリクス § Research Update`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-AUTH-12: requireOwnership: 非 owner かつ非 admin は 403

**endpoint**: `PUT /research/{other_humId}/update` (authenticated だが uids に含まれない)

**不変条件**:
- `status === 403`
- IT-ERROR-04 と同じ RFC 7807 形式

**回帰元**: `architecture.md § 認可マトリクス`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-AUTH-13: adminOnly: 非 admin は 403

**endpoint**: `POST /research/{humId}/approve` (authenticated だが非 admin)

**不変条件**:
- `status === 403`

**回帰元**: `architecture.md § 認可マトリクス § Approve/Reject`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-AUTH-14: loadResearchAndAuthorize: deleted は全ユーザーに 404

**endpoint**: `PUT /research/{deleted_humId}/update` (admin token)

**不変条件**:
- `status === 404` (admin でも触れない)
- IT-ERROR-07 と同じ shape

**回帰元**: `architecture.md § deleted 状態`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-AUTH-15: loadResearchAndAuthorize: 存在しない humId は 404

**endpoint**: `PUT /research/__not_a_humId__/update` (admin token)

**不変条件**:
- `status === 404`
- `title === "Not Found"`

**回帰元**: `errors/index.ts § NotFoundError.forResource`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-AUTH-16: status フィルタの権限 (public)

**endpoint**: `GET /research?status=draft` (Authorization なし)

**不変条件**:
- `status === 403`
- `title === "Forbidden"`
- `GET /research?status=published` は 200

**回帰元**: `architecture.md § status フィルタの権限`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts`

### IT-AUTH-17: status フィルタの権限 (authenticated)

**endpoint**: `GET /research?status=draft` (authenticated 非 admin token)

**不変条件**:
- `status === 200`
- 返る Research は **自分が `uids` に含まれるもののみ**
- 他人の draft は含まれない

**回帰元**: `architecture.md § status フィルタの権限`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts`

### IT-AUTH-18: 値ベースの field control (public / non-owner)

**endpoint**: `GET /research/{published_humId}` (Authorization なし)

**不変条件**:
- レスポンスに `status`, `uids`, `draftVersion` の **フィールドは存在する** (shape 統一)
- 値は `status === "published"`, `uids === []`, `draftVersion === null`
- `_seq_no` / `_primary_term` は返る (Dataset と統一)

**回帰元**: `architecture.md § 値ベースの制御`

**関連 unit テスト**: `tests/unit/api/types/research-summary.test.ts`、`tests/unit/api/es-client/auth.test.ts`

### IT-AUTH-19: 値ベースの field control (owner / admin)

**endpoint**: `GET /research/{humId}` (owner token)

**不変条件**:
- `status`, `uids`, `draftVersion` が **実際の値** で返る (例: `status === "draft"`, `uids` 含むユーザーIDs)
- admin token でも同じ

**回帰元**: `architecture.md § 値ベースの制御`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-AUTH-20: 認証ありの GET /research でレスポンスに status フィールドが含まれる

**endpoint**: `GET /research` (authenticated token)

**不変条件**:
- `data[].status` フィールドが存在する (public の場合は含まれない仕様)
- > 注: `docs/api-guide.md § 一覧レスポンスの多言語フィールド` の最後の段落

**回帰元**: `docs/api-guide.md § 一覧レスポンスの多言語フィールド`

**関連 unit テスト**: `tests/unit/api/types/research-summary.test.ts`

### IT-AUTH-21: Authorization に Bearer prefix がないと 401

**endpoint**: `GET /admin/is-admin` (`Authorization: token-without-bearer-prefix`)

**不変条件**:
- `status === 401`
- `title === "Unauthorized"`、`detail` に「Authentication required」相当
- `extractBearerToken` が `null` を返し、JWT 検証に到達しない

**回帰元**: `middleware/auth.ts § extractBearerToken`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

### IT-AUTH-22: Bearer の token が空文字なら 401

**endpoint**: `GET /admin/is-admin` (`Authorization: Bearer `)

**不変条件**:
- `status === 401`
- 空 token は regex で抜けるか JWT 検証で失敗する
- 500 にはならない

**回帰元**: `middleware/auth.ts § extractBearerToken`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`

---

## IT-FACETS-*: ファセット

`GET /facets` / `GET /facets/{fieldName}` (`countBy=research|dataset`)、facet-order.json の優先順、18 種以外で 400、認証状態によるファセット値の変化、include filter 引き継ぎ。

### IT-FACETS-01: GET /facets 正常応答

**endpoint**: `GET /facets`

**不変条件**:
- `status === 200`
- body は `SingleReadOnlyResponse<FacetsMap>` 形式
- `data` のキーは Dataset facet 18 種の subset または superset (`criteria`, `assayType`, ...)
- 各値は `[{ value: string, count: number }, ...]` 形式
- public ユーザーには published Dataset のみがカウント対象

**回帰元**: `docs/api-guide.md § 検索の使い方`

**関連 unit テスト**: `tests/unit/api/routes/facets.test.ts`

### IT-FACETS-02: countBy=research と countBy=dataset で count が変わる (同じ shape)

**endpoint**: `GET /facets?countBy=research` vs `GET /facets?countBy=dataset`

**不変条件**:
- 両方とも `status === 200`、key 集合が一致
- 同じ bucketKey の count は **必ずしも一致しない** (countBy=research は humId cardinality、countBy=dataset は datasetId cardinality)
- どちらの mode でも `count >= 0`、`count <= 全 Research/Dataset total`

**回帰元**: `docs/api-guide.md § ファセット件数の単位`

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-FACETS-03: GET /facets/{fieldName} 正常応答

**endpoint**: `GET /facets/assayType`

**不変条件**:
- `status === 200`
- `data.fieldName === "assayType"`
- `data.values` は `[{ value: string, count: number }]` 配列、`count >= 0`
- count 降順、ただし facet-order.json に列挙された値は **定義順で先頭** に並ぶ

**回帰元**: `docs/api-guide.md § ファセット値の並び順`

**関連 unit テスト**: `tests/unit/api/es-client/facet-order.test.ts`

### IT-FACETS-04: facet-order.json の優先値が先頭に並ぶ

**endpoint**: `GET /facets/criteria` (criteria は facet-order.json で順序定義あり)

**不変条件**:
- `data.values` の prefix は facet-order.json の定義順
- 定義値が ES 結果に存在しない場合はその値は **含まれない** (skip される)
- 定義外の値は count 降順で続く

**回帰元**: `docs/api-guide.md § ファセット値の並び順` / `src/api/data/facet-order.json`

**関連 unit テスト**: `tests/unit/api/es-client/facet-order.test.ts`

### IT-FACETS-05: 不正な fieldName は 400

**endpoint**: `GET /facets/__not_a_field__`

**不変条件**:
- `status === 400`
- `title === "Validation Error"`、RFC 7807 形式
- `Content-Type: application/problem+json`

**回帰元**: `src/api/routes/search.ts § getFacetFieldRoute` (`z.enum(DATASET_FACET_NAMES)` で path param を弾く)

**関連 unit テスト**: `tests/unit/api/routes/facets.test.ts`

### IT-FACETS-06: フィルタを渡すと count が絞り込まれる

**endpoint**: `GET /facets?assayType=WGS` vs `GET /facets` (全体)

**不変条件**:
- フィルタ後の count の合計 ≤ 全体の count
- フィルタフィールド自体 (assayType) の合計はフィルタが効くため小さくなる
- 他フィールド (tissues 等) は filter で絞られた Dataset 部分集合で集計される

**回帰元**: `docs/api-guide.md § ファセット件数の単位` / `routes/search.ts § getFacetsRoute`

**関連 unit テスト**: `tests/unit/api/es-client/search-filters.test.ts`

### IT-FACETS-07: 認証なしでは published Dataset のみカウント

**endpoint**: `GET /facets` (Authorization なし)

**不変条件**:
- カウント対象は `latestVersion !== null AND status !== "deleted"` な Research 配下の Dataset のみ
- authenticated との合計が一致しない (auth では自分の draft も含まれる)

**回帰元**: `docs/api-guide.md § ファセット値は認証状態により変わる`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-FACETS-08: facet-order.json の優先値が ES 結果に無い場合は skip

**endpoint**: `GET /facets/criteria` (facet-order.json に列挙された値の一部が ES に存在しない状態)

**不変条件**:
- 定義された優先値のうち、ES 結果に **存在しないもの** は `data.values` に含まれない (count=0 で残らない)
- 存在するものだけが定義順で先頭に並び、残りが count 降順

**回帰元**: `docs/api-guide.md § ファセット値の並び順` (「ES 結果に存在しない定義値は含まれない」)

**関連 unit テスト**: `tests/unit/api/es-client/facet-order.test.ts`

---

## IT-SEARCH-*: 検索

`POST /research/search` / `POST /dataset/search`、`GET /research` / `GET /dataset` (リスト)、`includeFacets`、`query` の fulltext + ID 完全一致/前方一致、`datasetId` 経由の親 Research ヒット、case-insensitive、fuzziness、`filters` ネスト、`datasetFilters` (research search のみ)、Range フィルタ、Boolean フィルタ、disease / diseaseIcd10、ページネーション境界、sort/order。

### IT-SEARCH-01: GET /research 一覧の正常応答

**endpoint**: `GET /research?page=1&limit=5&lang=ja`

**不変条件**:
- `status === 200`
- body は `SearchResponse<ResearchSummary>` 形式: `data`, `meta.pagination`, `meta.requestId`, `meta.timestamp`
- `meta.pagination` に `page`, `limit`, `total`, `totalPages`
- `data.length <= 5`、`data.length <= meta.pagination.total`
- 各 item の `title` は BilingualText 形式 (`{ ja, en }`)

**回帰元**: `docs/api-guide.md § 一覧レスポンスの多言語フィールド`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts`、`tests/unit/api/types/research-summary.test.ts`

### IT-SEARCH-02: ページネーション境界

**endpoint**: `GET /research?page=<P>&limit=<L>`

**不変条件 (parametrize)**:
- `(P=1, L=1)`: 200、`data.length <= 1`
- `(P=1, L=100)`: 200
- `(P=1, L=101)`: 400
- `(P=0, L=20)`: 400
- `(P=-1, L=20)`: 400
- `(P=1, L=0)`: 400
- 大きすぎる `P`: 200、`data` 空配列、`total > 0` (data がないだけ)

**回帰元**: `docs/api-guide.md § ページネーション`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts`、`tests/unit/api/types/request-schemas.test.ts`

### IT-SEARCH-03: lang=en 指定時に英語フィールドが返る

**endpoint**: `GET /research?lang=en`

**不変条件**:
- `methods` / `targets` 等の単言語フィールドは英語値
- `title` は BilingualText のまま (`{ ja, en }`)
- `lang=ja` の同じ Research と比べて `title.ja` / `title.en` が一致 (BilingualText は lang に依存しない)
- `data[].methods` が `lang=ja` レスポンスの値と異なる (英語版がある場合)

**回帰元**: `docs/api-guide.md § 言語パラメータ`

**関連 unit テスト**: `tests/unit/api/types/research-summary.test.ts`

### IT-SEARCH-04: 不正な lang は 400

**endpoint**: `GET /research?lang=fr`

**不変条件**:
- `status === 400`
- `title === "Validation Error"`

**回帰元**: `docs/api-guide.md § 言語パラメータ` / `Zod ja|en enum`

**関連 unit テスト**: `tests/unit/api/routes/dataset/index.test.ts` (lang バリデーション、Research も同様)

### IT-SEARCH-05: sort/order の正常系

**endpoint**: `GET /research?sort=datePublished&order=desc&limit=20`

**不変条件**:
- `status === 200`
- 連続する 2 item の `datePublished` が降順 (null は末尾)
- `sort=humId&order=asc` で humId 文字列の昇順

**回帰元**: `routes/research/routes.ts § listResearchRoute` / 検索ロジック

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-06: 不正な sort は 400

**endpoint**: `GET /research?sort=__not_a_field__`

**不変条件**:
- `status === 400`

**回帰元**: Zod enum

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts`

### IT-SEARCH-07: POST /research/search 正常応答

**endpoint**: `POST /research/search` body: `{ page: 1, limit: 5, lang: "ja" }`

**不変条件**:
- `status === 200`、shape は IT-SEARCH-01 と同じ
- `includeFacets` 未指定なら `facets` プロパティは存在しない (または null)

**回帰元**: `docs/api-guide.md § POST 検索ボディのフィルター構造`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts`

### IT-SEARCH-08: POST /research/search includeFacets=true でファセット返却

**endpoint**: `POST /research/search` body: `{ ..., includeFacets: true }`

**不変条件**:
- `facets` プロパティが存在し object 形式
- `facets` のキーは Dataset facet 18 種に含まれる
- 各 facet の `count` は **Research 数** (humId cardinality) — `POST /research/search` 固有の仕様

**回帰元**: `docs/api-guide.md § ファセット件数の単位`

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-09: query で humId 完全一致

**endpoint**: `POST /research/search` body: `{ query: "<existing humId>" }`

**不変条件**:
- 返る `data` 配列に対象 humId が **必ず先頭** で含まれる (boost で最上位)
- `total >= 1`

**回帰元**: `docs/api-guide.md § フリーテキスト検索 § Research 検索`

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-10: query で humId 前方一致

**endpoint**: `POST /research/search` body: `{ query: "hum000" }` (prefix)

**不変条件**:
- 返る `data` の humId が全て `hum000` で始まる、または fulltext で title 等にヒットしたもの
- 候補が複数件存在するなら `total >= 2`

**回帰元**: `docs/api-guide.md § フリーテキスト検索 § ID 完全一致/前方一致`

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-11: query が humId と大文字小文字違いでも一致

**endpoint**: `POST /research/search` body: `{ query: "HUM0001" }`

**不変条件**:
- 小文字 `hum0001` の Research が `data` に含まれる
- `total >= 1`

**回帰元**: `docs/api-guide.md § ID マッチは大文字小文字を区別しない`

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-12: query が datasetId のとき親 Research がヒット

**endpoint**: `POST /research/search` body: `{ query: "<existing datasetId>" }`

**不変条件**:
- 該当 Dataset の親 `humId` を持つ Research が `data` に含まれる
- > 注: Research index には datasetId フィールドが無いため、内部で Dataset index を引いて親 humId を経由するロジック

**回帰元**: `docs/api-guide.md § フリーテキスト検索 § Research 検索`

**関連 unit テスト**: `tests/unit/api/es-client/search.test.ts`

### IT-SEARCH-13: query 複合 (`hum0001 cancer`) は本文ヒット優先

**endpoint**: `POST /research/search` body: `{ query: "hum0001 cancer" }`

**不変条件**:
- ID 完全一致経路は空振り、本文 `cancer` でヒット
- `data` の humId は `hum0001` に限らない

**回帰元**: `docs/api-guide.md § ID マッチは大文字小文字を区別しない` (最後の段落)

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-14: POST /research/search の status フィルタ権限 (public)

**endpoint**: `POST /research/search` body: `{ status: "draft" }` (Authorization なし)

**不変条件**:
- `status === 403`
- `title === "Forbidden"`、`detail` に「Public users can only access published」相当

**回帰元**: `docs/api-guide.md § status フィルタの権限`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts`

### IT-SEARCH-15: POST /research/search の datasetFilters

**endpoint**: `POST /research/search` body: `{ datasetFilters: { assayType: ["WGS"] } }`

**不変条件**:
- 返る Research は配下に `assayType=WGS` の Dataset を持つもの
- `datasetFilters` を `filters` トップレベルに置いても **無視される** (Research には Dataset attribute がないため)

**回帰元**: `docs/api-guide.md § POST 検索ボディのフィルター構造`

**関連 unit テスト**: `tests/unit/api/es-client/search-filters.test.ts`、`tests/unit/api/types/search-body.test.ts`

### IT-SEARCH-16: POST /research/search の Range フィルタ (datePublished)

**endpoint**: `POST /research/search` body: `{ datePublished: { min: "2020-01-01" } }`

**不変条件**:
- 返る Research の `datePublished` がすべて `>= 2020-01-01`
- `total <= 全体 total`

**回帰元**: `docs/api-guide.md § Range フィルター`

**関連 unit テスト**: `tests/unit/api/es-client/filters.test.ts`、`tests/unit/api/types/search-body.test.ts`

### IT-SEARCH-17: POST /dataset/search 正常応答

**endpoint**: `POST /dataset/search` body: `{ page: 1, limit: 5, lang: "ja" }`

**不変条件**:
- `status === 200`、`data` は `EsDataset` 配列
- `meta.pagination` あり

**回帰元**: `docs/api-guide.md § POST 検索ボディのフィルター構造`

**関連 unit テスト**: `tests/unit/api/routes/dataset/index.test.ts`

### IT-SEARCH-18: POST /dataset/search filters の OR / AND

**endpoint**:
- A: `{ filters: { assayType: ["WGS", "WES"] } }`
- B: `{ filters: { assayType: ["WGS"], tissues: ["Blood"] } }`

**不変条件**:
- A: `data` の各 item が `WGS or WES` を experiments に含む
- B: `data` の各 item が `WGS AND Blood` を experiments に含む
- A.total >= B.total (フィルタが厳しいほど少ない)

**回帰元**: `docs/api-guide.md § フィルタの動作`

**関連 unit テスト**: `tests/unit/api/es-client/filters.test.ts`

### IT-SEARCH-19: POST /dataset/search の datasetId 完全/前方一致

**endpoint**: `POST /dataset/search` body: `{ query: "<existing datasetId>" }` / prefix

**不変条件**:
- 完全一致: 対象 Dataset が **先頭** で含まれる
- 前方一致: 該当 prefix を持つ Dataset 群が含まれる
- 大文字版でもヒット (case-insensitive)

**回帰元**: `docs/api-guide.md § フリーテキスト検索 § Dataset 検索`

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-20: POST /dataset/search で query が humId のとき配下 Dataset がヒット

**endpoint**: `POST /dataset/search` body: `{ query: "<existing humId>" }`

**不変条件**:
- 返る Dataset は全て `humId === <input>` (親フィルタ)
- `total === <親の Dataset 数>`

**回帰元**: `docs/api-guide.md § フリーテキスト検索 § Dataset 検索`

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-21: POST /dataset/search の Boolean フィルタ (hasPhenotypeData)

**endpoint**: `POST /dataset/search` body: `{ filters: { hasPhenotypeData: true } }`

**不変条件**:
- 返る Dataset の experiments のいずれかが `hasPhenotypeData=true`
- `total <= 全体 total`

**回帰元**: `docs/api-guide.md § Boolean フィルター`

**関連 unit テスト**: `tests/unit/api/es-client/filters.test.ts`

### IT-SEARCH-22: POST /dataset/search の Range フィルタ (subjectCount)

**endpoint**: `POST /dataset/search` body: `{ filters: { subjectCount: { min: 100 } } }`

**不変条件**:
- 返る Dataset の `subjectCount >= 100`
- min/max 同時指定で `min <= subjectCount <= max`

**回帰元**: `docs/api-guide.md § Range フィルター`

**関連 unit テスト**: `tests/unit/api/es-client/filters.test.ts`

### IT-SEARCH-23: POST /dataset/search の disease (部分一致)

**endpoint**: `POST /dataset/search` body: `{ filters: { disease: "cancer" } }`

**不変条件**:
- 返る Dataset の experiments に `disease.label` が `cancer` を含むものがある (例: "lung cancer")
- 大文字小文字を問わずヒット

**回帰元**: `docs/api-guide.md § 疾患検索`

**関連 unit テスト**: `tests/unit/api/es-client/filters.test.ts`

### IT-SEARCH-24: POST /dataset/search の diseaseIcd10 (前方一致)

**endpoint**: `POST /dataset/search` body: `{ filters: { diseaseIcd10: ["C50"] } }`

**不変条件**:
- 返る Dataset の experiments に ICD-10 が `C50` で始まるものがある (`C50.1`, `C50.9` 等)

**回帰元**: `docs/api-guide.md § 疾患検索`

**関連 unit テスト**: `tests/unit/api/es-client/filters.test.ts`

### IT-SEARCH-25: 全文検索の fuzziness 境界

**endpoint**: `POST /dataset/search` body: `{ query: "<token>" }` で typo を 1, 2 文字入れる

**不変条件 (parametrize)**:
- 4 文字以内の typo: ヒットしない (fuzziness=0)
- 5-11 文字で typo 1: ヒット (例: "canser" → cancer)
- 5-11 文字で typo 2: ヒットしない
- 12 文字以上で typo 2: ヒット

**回帰元**: `docs/api-guide.md § 全文検索の fuzziness`

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-26: 検索結果の冪等性 (同じパラメータで 2 回叩いて結果一致)

**endpoint**: `POST /research/search` body: 任意 (例: `{ page: 1, limit: 20 }`)

**不変条件**:
- 2 回叩いた結果の `data[].humId` 集合が一致
- `total` が一致
- 実行順序非依存

**回帰元**: integration-note.md § 件数 drift 対策 のテストパターン例

**関連 unit テスト**: なし

### IT-SEARCH-27: 検索結果の case-insensitive (query)

**endpoint**: `POST /research/search` body: `{ query: "cancer" }` と `{ query: "CANCER" }`

**不変条件**:
- 2 つの結果の `humId` 集合が一致

**回帰元**: `docs/api-guide.md § ID マッチは大文字小文字を区別しない` + ES standard analyzer

**関連 unit テスト**: なし

### IT-SEARCH-28: 空文字 query は全文検索なし扱い

**endpoint**: `POST /research/search` body: `{ query: "" }`

**不変条件**:
- `status === 200`
- `data` / `total` が `query` 未指定と同じ結果集合
- 400 にはならない (空文字は valid な入力扱い)

**回帰元**: `es-client/query-builders.ts § buildSearchQuery`

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-29: sort=relevance + query 未指定でも 200

**endpoint**: `POST /research/search` body: `{ sort: "relevance" }` (query なし)

**不変条件**:
- `status === 200`
- relevance score が無い検索でも sort が fallback されて 500 にならない
- `data` の並び順は決定的 (2 回叩いて同じ順序)

**回帰元**: `routes/search.ts § convertResearchBodyToQuery § sortMap`

**関連 unit テスト**: `tests/unit/api/es-client/query-builders.test.ts`

### IT-SEARCH-30: deleted Research は検索結果に含まれない (全 user 共通)

**endpoint**: `POST /research/search` および `GET /research` (deleted humId を含む任意の検索条件)

**不変条件**:
- public / authenticated / admin の全 user で `data[].humId` に deleted Research が **含まれない**
- 「閲覧可能 (architecture.md)」と「検索結果に含む」は別扱い。詳細取得 (`GET /research/{humId}`) では admin/owner が 200 で取れる場合あり (IT-ERROR-07 と整合) だが、検索 API では一律除外

**回帰元**: `architecture.md § deleted 状態` / `es-client/auth.ts § buildStatusFilter`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

---

## IT-DATASET-*: Dataset

`GET /dataset` (list)、`GET /dataset/{datasetId}` (バージョン解決・可視性)、`PUT /dataset/{datasetId}/update` (楽観的ロック、親 Research が draft のみ、`experiments[].header/data` 必須)、`POST /dataset/{datasetId}/delete` (物理削除、admin のみ)、`GET /dataset/{datasetId}/versions`、`GET /dataset/{datasetId}/versions/{version}`、`GET /dataset/{datasetId}/research`。

### IT-DATASET-01: GET /dataset 一覧の正常応答

**endpoint**: `GET /dataset?page=1&limit=5&lang=ja`

**不変条件**:
- `status === 200`、`SearchResponse<EsDataset>` 形式
- 認証なしでは `data` 中の Dataset は **親 Research が公開条件を満たすもの** に限る
- `data.length <= 5`

**回帰元**: `docs/api-guide.md § Dataset API`、`architecture.md § Dataset の status 依存`

**関連 unit テスト**: `tests/unit/api/routes/dataset/index.test.ts`

### IT-DATASET-02: ページネーション境界 (DATASET 用)

**endpoint**: `GET /dataset?page=<P>&limit=<L>` (parametrize)

**不変条件 (parametrize)**: IT-SEARCH-02 と同じ境界が成立

**回帰元**: `docs/api-guide.md § ページネーション`

**関連 unit テスト**: `tests/unit/api/routes/dataset/index.test.ts`

### IT-DATASET-03: GET /dataset/{datasetId} 正常応答 (latest)

**endpoint**: `GET /dataset/{published_datasetId}`

**不変条件**:
- `status === 200`
- `data.datasetId === <input>`
- `data` に `mergedSearchable` フィールドが含まれる (`addMergedSearchable` の出力)
- `meta._seq_no` と `meta._primary_term` が含まれる (楽観的ロック用)
- 認証なしで取得できる (親 Research が公開条件を満たす場合)

**回帰元**: `docs/api-guide.md § バージョン指定`、`routes/dataset.ts`

**関連 unit テスト**: `tests/unit/api/utils/merge-searchable.test.ts`

### IT-DATASET-04: GET /dataset/{datasetId} 存在しない ID は 404

**endpoint**: `GET /dataset/__not_a_datasetId__`

**不変条件**:
- `status === 404`
- RFC 7807 形式

**回帰元**: `docs/api-guide.md § エラーレスポンス`

**関連 unit テスト**: `tests/unit/api/es-client/dataset.test.ts`

### IT-DATASET-05: GET /dataset/{datasetId}?version=v1 で特定バージョン取得

**endpoint**: `GET /dataset/{datasetId}?version=v1` および `GET /dataset/{datasetId}/versions/v1`

**不変条件**:
- 両形式とも `status === 200`
- `data.version === "v1"`
- 同じ datasetId+version で 2 形式の `data` が **構造的に一致** (`_seq_no` 等の meta は除く)

**回帰元**: `docs/api-guide.md § バージョン指定`

**関連 unit テスト**: `tests/unit/api/utils/version.test.ts`

### IT-DATASET-06: GET /dataset/{datasetId}?version=vN で存在しない version は 404

**endpoint**: `GET /dataset/{datasetId}?version=v999`

**不変条件**:
- `status === 404`

**回帰元**: `docs/api-guide.md § バージョン指定`

**関連 unit テスト**: `tests/unit/api/es-client/dataset.test.ts`

### IT-DATASET-07: 親 Research が draft の Dataset は public に非公開

**endpoint**: `GET /dataset/{datasetId_of_draft_research}` (Authorization なし)

**不変条件**:
- `status === 404` (情報漏洩防止)
- 同じ datasetId に admin token でアクセスすれば 200

**回帰元**: `architecture.md § Dataset の status 依存` (draft latestVersion=null 時)

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-DATASET-08: 親 Research が draft (latestVersion!=null) の Dataset は public 可視 (公開版のみ)

**endpoint**: `GET /dataset/{datasetId}` (親 Research が `latestVersion=v1, draftVersion=v2, status=draft`)

**不変条件**:
- public で 200、`data.version === "v1"` (公開版)
- public が `?version=v2` を叩いた場合 404
- owner/admin が `?version=v2` を叩いた場合 200

**回帰元**: `architecture.md § Dataset の status 依存`、`architecture.md § バージョン解決ルール`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

> **Note**: 現実装の状態遷移経路 (`approve` → `unpublish` は `latestVersion` を `draftVersion` に移して `latestVersion=null` にする) では「draft かつ `latestVersion!=null`」の状態が生じない。可視性ルール自体は `tests/unit/api/utils/version.test.ts` で人工 doc を用いて検証済みのため、integration では対象外とする。

### IT-DATASET-09: PUT /dataset/{datasetId}/update は未認証で 401

**endpoint**: `PUT /dataset/{datasetId}/update` (Authorization なし)

**不変条件**:
- `status === 401`

**回帰元**: `architecture.md § 認可マトリクス § Dataset Update`

**関連 unit テスト**: `tests/unit/api/routes/dataset/index.test.ts` (auth セクション)

### IT-DATASET-10: PUT /dataset/{datasetId}/update は非 owner で 403

**endpoint**: `PUT /dataset/{datasetId}/update` (authenticated だが親 Research の uids に含まれない)

**不変条件**:
- `status === 403`

**回帰元**: `architecture.md § 認可マトリクス`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-DATASET-11: PUT /dataset/{datasetId}/update は親 Research が draft でないと 403

**endpoint**: `PUT /dataset/{review_research_datasetId}/update` (owner token、親が review)

**不変条件**:
- `status === 403`
- `detail` に「parent Research is not in draft status」相当
- 同じ Dataset に対し親が draft に戻れば 200

**回帰元**: `architecture.md § Dataset の status 依存` / `src/api/routes/dataset.ts § updateDatasetRoute § D1 check`

**関連 unit テスト**: `tests/unit/api/routes/dataset/index.test.ts` (parent status guard)

### IT-DATASET-12: PUT /dataset/{datasetId}/update の楽観的ロック (409)

**endpoint**: `PUT /dataset/{datasetId}/update` (古い `_seq_no` / `_primary_term`)

**不変条件**:
- `status === 409`
- IT-ERROR-05 と同じ shape

**回帰元**: `docs/api-guide.md § 楽観的ロックの使い方`

**関連 unit テスト**: `tests/unit/api/es-client/dataset.test.ts`

### IT-DATASET-13: PUT /dataset/{datasetId}/update は experiments を required 扱い (空置換禁止)

**endpoint**: `PUT /dataset/{datasetId}/update` body から `experiments[].header` / `experiments[].data` を欠落させる

**不変条件**:
- `status === 400`
- バリデーションエラーで `experiments[].header` / `experiments[].data` 不在を指摘

**回帰元**: `docs/api-guide.md § Create Dataset for Research の初期化挙動` (最後の段落)

**関連 unit テスト**: `tests/unit/api/types/request-schemas.test.ts`

### IT-DATASET-14: PUT /dataset/{datasetId}/update は rawHtml を strip する

**endpoint**: `PUT /dataset/{datasetId}/update` body に `typeOfData.rawHtml` を含めて送信

**不変条件**:
- `status === 200`
- 直後の GET で `data.typeOfData.rawHtml === null` (rawHtml は破棄され null で上書き)
- silently strip (400 を返さない)

**回帰元**: `docs/api-guide.md § Create/Update リクエストでの rawHtml 扱い`

**関連 unit テスト**: `tests/unit/api/utils/hydrate-raw-html.test.ts`

### IT-DATASET-15: POST /dataset/{datasetId}/delete は admin のみ

**endpoint**: `POST /dataset/{datasetId}/delete`

**不変条件 (parametrize)**:
- 未認証: 401
- 非 owner authenticated: 403
- owner authenticated: 403 (Dataset Delete は admin only)
- admin: 204

**回帰元**: `architecture.md § 認可マトリクス § Dataset Delete`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-DATASET-16: 削除した Dataset は GET 404 / 親の dataset list からも消える

**endpoint**: `POST /dataset/{datasetId}/delete` → `GET /dataset/{datasetId}` → `GET /research/{parentHumId}/dataset`

**不変条件**:
- delete 後の GET dataset: 404
- delete 後の GET research/{humId}/dataset: 該当 datasetId が `data` に含まれない
- 親 Research の `ResearchVersion.datasets` からも除去される

**回帰元**: `architecture.md § Dataset のバージョン § 4. Dataset の削除`

**関連 unit テスト**: `tests/unit/api/es-client/dataset.test.ts`

### IT-DATASET-17: GET /dataset/{datasetId}/versions 正常応答

**endpoint**: `GET /dataset/{multi_version_datasetId}/versions`

**不変条件**:
- `status === 200`
- `data` は `[{ version: "v1" }, { version: "v2" }, ...]` 形式の配列
- バージョンは v1, v2, ... と単調増加で並ぶ

**回帰元**: `architecture.md § Dataset のバージョン`

**関連 unit テスト**: `tests/unit/api/es-client/dataset.test.ts`

### IT-DATASET-18: GET /dataset/{datasetId}/research で親が返る

**endpoint**: `GET /dataset/{datasetId}/research`

**不変条件**:
- `status === 200`
- `data.humId === <parent humId>`
- 認証状態によって status/uids/draftVersion の field control が IT-AUTH-18/19 と一致

**回帰元**: `docs/api-guide.md § Dataset API`

**関連 unit テスト**: `tests/unit/api/es-client/dataset.test.ts`

### IT-DATASET-19: GET /dataset?humId= で humId フィルタ

**endpoint**: `GET /dataset?humId=hum0001`

**不変条件**:
- `status === 200`
- `data` の全 item の `humId === "hum0001"`
- 親 Research が公開条件を満たさない場合 (public): 空配列
- `humId` 未指定との比較で `total` は小さい (フィルタが効く)

**回帰元**: `routes/dataset.ts § listDatasetsRoute` / `types/query-params.ts § DatasetListingQuerySchema`

**関連 unit テスト**: `tests/unit/api/routes/dataset/index.test.ts`

---

## IT-RESEARCH-*: Research (CRUD + UIDs)

`GET /research` (list、status フィルタの権限、value-based field control: status/uids/draftVersion)、`POST /research/new` (humId 自動採番、`op_type:create` 重複で 409、3 回リトライ)、`GET /research/{humId}` (バージョン解決、public 範囲)、`PUT /research/{humId}/update` (全置換、rawHtml null 上書き、楽観的ロック)、`POST /research/{humId}/delete` (論理削除＋紐づく Dataset 物理削除)、`PUT /research/{humId}/uids` (admin)。

### IT-RESEARCH-01: GET /research 一覧 (public)

**endpoint**: `GET /research?page=1&limit=10` (Authorization なし)

**不変条件**:
- `status === 200`
- `data` は `latestVersion !== null AND status !== "deleted"` のみ
- 各 item の `status === "published"` (value-based)
- 各 item で `uids` / `draftVersion` / `latestVersion` は **omit** (`ResearchSummary` のシェイプ。詳細との違いに注意)
- list は item 単位の `_seq_no` / `_primary_term` を**含まない** (含まれるのは detail のみ)

**回帰元**: `architecture.md § 公開条件` / `architecture.md § レスポンスのフィールド制御`

**関連 unit テスト**: `tests/unit/api/types/research-summary.test.ts`

### IT-RESEARCH-02: GET /research の status フィルタ (public)

**endpoint (parametrize)**:
- `GET /research?status=published` → 200
- `GET /research?status=draft` → 403
- `GET /research?status=review` → 403
- `GET /research?status=deleted` → 403

**不変条件**:
- `published` 以外を public が指定したら必ず 403 (`title === "Forbidden"`)
- 403 の detail に「Public users can only access published」相当

**回帰元**: `architecture.md § status フィルタの権限` / `routes/research/crud.ts § listResearchRoute`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts`

### IT-RESEARCH-03: GET /research の status フィルタ (authenticated)

**endpoint**: `GET /research?status=draft` (non-admin authenticated)

**不変条件**:
- `status === 200`
- 返る Research は **自分が uids に含まれるもののみ**
- 他人の draft は含まれない

**回帰元**: `architecture.md § status フィルタの権限`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-RESEARCH-04: POST /research/new (admin) で humId 自動採番

**endpoint**: `POST /research/new` body: `{}` (admin token)

**不変条件**:
- `status === 201`
- `data.humId` が `hum\d{4,}` 形式
- `data.status === "draft"`、`data.latestVersion === null`、`data.draftVersion === "v1"`
- `meta._seq_no`, `meta._primary_term` あり
- 直後の `GET /research/{humId}` (admin) で取得できる

**回帰元**: `docs/api-guide.md § 新規 Research 作成`、`architecture.md § 状態遷移テーブル § create`

**関連 unit テスト**: `tests/unit/api/es-client/research.test.ts`

### IT-RESEARCH-05: POST /research/new で humId 明示指定

**endpoint**: `POST /research/new` body: `{ humId: "hum9999" }` (admin)

**不変条件**:
- 未使用の humId なら 201、`data.humId === "hum9999"`
- 既存 humId なら 409 (`op_type: create` で `ConflictError.forDuplicate`)
- 409 の detail に「already exists」

**回帰元**: `architecture.md § 重複リソース作成の防止`

**関連 unit テスト**: `tests/unit/api/es-client/research.test.ts`

### IT-RESEARCH-06: POST /research/new は非 admin で 403

**endpoint**: `POST /research/new` (non-admin authenticated)

**不変条件**:
- `status === 403`
- `title === "Forbidden"`

**回帰元**: `architecture.md § 認可マトリクス § Research Create`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts` (auth セクション)

### IT-RESEARCH-07: humId 自動採番の衝突リトライ

**endpoint**: `POST /research/new` (並列で複数発行)

**不変条件**:
- 衝突しても最大 3 回まで自動リトライし、最終的に異なる humId で 201 を返す
- 4 回連続衝突で初めて 409 を返す (実装上の上限)
- > 注: 通常の integration では再現困難。unit でモックして検証する方が現実的

**回帰元**: `architecture.md § 重複リソース作成の防止`

**関連 unit テスト**: `tests/unit/api/es-client/research.test.ts` (retry-after-conflict)

> **Note**: 上記の通り integration では非決定的になるため隔離 index 上でも実装しない。`research.test.ts` に skip 注記のみ残し、retry 経路は ES client をモックする unit テストで網羅する。

### IT-RESEARCH-08: GET /research/{humId} の version 解決 (public)

**endpoint**: `GET /research/{humId}` (public、Research が `latestVersion=v1, draftVersion=v2, status=draft`)

**不変条件**:
- `status === 200`
- `data.version === "v1"` (public は latestVersion 固定)
- `data.draftVersion === null` (value-based field control)
- `?version=v2` を叩いたら 404 (public は latestVersion を超える指定不可)

**回帰元**: `architecture.md § バージョン解決ルール § 詳細取得`

**関連 unit テスト**: `tests/unit/api/utils/version.test.ts`

### IT-RESEARCH-09: GET /research/{humId} の version 解決 (owner)

**endpoint**: `GET /research/{humId}` (owner、同じ条件)

**不変条件**:
- `status === 200`
- `data.version === "v2"` (owner は `draftVersion ?? latestVersion`)
- `data.draftVersion === "v2"` (値ベースで実値)

**回帰元**: `architecture.md § バージョン解決ルール`

**関連 unit テスト**: `tests/unit/api/utils/version.test.ts`

### IT-RESEARCH-10: GET /research/{humId}?version=vN

**endpoint (parametrize)**: `GET /research/{humId}?version=v1` (`latestVersion=v2` の Research に対し)

**不変条件**:
- public: 200 (v1 <= latestVersion)
- public で `?version=v3`: 404
- owner/admin: `?version=v3` は 200 (全バージョンアクセス可)

**回帰元**: `architecture.md § バージョン解決ルール § バージョン直接指定時`

**関連 unit テスト**: `tests/unit/api/utils/version.test.ts`

### IT-RESEARCH-11: GET /research/{humId} の versionIds は除外される

**endpoint**: `GET /research/{humId}`

**不変条件**:
- レスポンスに `versionIds` フィールドが **含まれない** (内部メタ)
- `versions` を取りたい場合は `/versions` endpoint を使う

**回帰元**: `architecture.md § レスポンスのフィールド制御 § 全ユーザー共通で除外`

**関連 unit テスト**: `tests/unit/api/types/research-summary.test.ts`

### IT-RESEARCH-12: PUT /research/{humId}/update (owner) は 200

**endpoint**: `PUT /research/{draft_humId}/update` body: 完全 Research フィールド + `_seq_no` + `_primary_term`

**不変条件**:
- `status === 200`
- レスポンスの `data` に更新後の内容
- `meta._seq_no` が更新前と異なる (incremented)

**回帰元**: `docs/api-guide.md § Research 編集画面で Draft 保存`

**関連 unit テスト**: `tests/unit/api/es-client/research.test.ts`

### IT-RESEARCH-13: PUT /research/{humId}/update は draft 状態のみ (409)

**endpoint**: `PUT /research/{review_humId}/update` (owner、status=review)

**不変条件**:
- `status === 409`
- `detail` に「expected 'draft'」相当

**回帰元**: `crud.ts § updateResearchRoute § draft 検査`

**関連 unit テスト**: `tests/unit/api/routes/research/status-guard.test.ts` (既存)

### IT-RESEARCH-14: PUT /research/{humId}/update は楽観的ロック失敗で 409

**endpoint**: `PUT /research/{humId}/update` (古い `_seq_no`)

**不変条件**:
- `status === 409`

**回帰元**: `docs/api-guide.md § 楽観的ロックの使い方`

**関連 unit テスト**: `tests/unit/api/es-client/research.test.ts`

### IT-RESEARCH-15: PUT /research/{humId}/update は rawHtml を null 上書き

**endpoint**: `PUT /research/{humId}/update` body: `title: { text: "X" }` (rawHtml 抜き)

**不変条件**:
- `status === 200`
- 直後の GET (`includeRawHtml=true`) で `data.title.rawHtml === null`
- crawler 由来の rawHtml は API 編集で消える (仕様通り)

**回帰元**: `docs/api-guide.md § Create/Update リクエストでの rawHtml 扱い`

**関連 unit テスト**: `tests/unit/api/utils/hydrate-raw-html.test.ts`

### IT-RESEARCH-16: PUT /research/{humId}/update body に rawHtml を含めても silently strip

**endpoint**: `PUT /research/{humId}/update` body: `title: { text: "X", rawHtml: "<p>X</p>" }`

**不変条件**:
- `status === 200` (400 にはならない)
- 結果は IT-RESEARCH-15 と同じ (`rawHtml === null`)

**回帰元**: `docs/api-guide.md § Create/Update リクエストでの rawHtml 扱い`

**関連 unit テスト**: `tests/unit/api/types/request-schemas.test.ts`

### IT-RESEARCH-17: PUT /research/{humId}/update の修正不可フィールド

**endpoint**: `PUT /research/{humId}/update` body に `humId`, `url`, `versionIds`, `latestVersion`, `datePublished` を含めて送る

**不変条件**:
- `status === 200` (silently strip)
- これらのフィールドは更新されない

**回帰元**: `routes/research/routes.ts § updateResearchRoute § "Note"`

**関連 unit テスト**: `tests/unit/api/types/request-schemas.test.ts`

### IT-RESEARCH-18: POST /research/{humId}/delete (admin) 論理削除

**endpoint**: `POST /research/{humId}/delete` (admin)

**不変条件**:
- `status === 204`
- 直後の `GET /research/{humId}` (admin): 404 (deleted は admin にも 404)
- `GET /research/{humId}/versions` (admin): 404
- 削除前に紐づいていた Dataset は **物理削除** されている (GET /dataset/{datasetId} で 404)

**回帰元**: `architecture.md § deleted 状態` / `architecture.md § Research と Dataset の関係 § ライフサイクル連動`

**関連 unit テスト**: `tests/unit/api/es-client/research-delete.test.ts`

### IT-RESEARCH-19: POST /research/{humId}/delete は非 admin で 403

**endpoint**: `POST /research/{humId}/delete` (owner だが非 admin)

**不変条件**:
- `status === 403`

**回帰元**: `architecture.md § 認可マトリクス § Research Delete`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-RESEARCH-20: 削除済み humId は再利用不可

**endpoint**: 削除済み humId に対し `POST /research/new` body: `{ humId: <deleted_id> }`

**不変条件**:
- `status === 409` (`op_type: create` で重複扱い)
- 削除は論理削除なので ES 上はドキュメントが残っている

**回帰元**: `architecture.md § deleted 状態` (humId uniqueness 保持目的)

**関連 unit テスト**: `tests/unit/api/es-client/research.test.ts`

### IT-RESEARCH-21: PUT /research/{humId}/uids (admin) で uids 更新

**endpoint**: `PUT /research/{humId}/uids` body: `{ uids: ["uid1", "uid2"], _seq_no, _primary_term }`

**不変条件**:
- `status === 200`
- 直後の admin GET で `data.uids === ["uid1", "uid2"]`
- uid1 ユーザーで update 系 endpoint を叩けるようになる

**回帰元**: `docs/api-guide.md § Research API § PUT /research/{humId}/uids`

**関連 unit テスト**: `tests/unit/api/es-client/research.test.ts`

### IT-RESEARCH-22: PUT /research/{humId}/uids は非 admin で 403

**endpoint**: `PUT /research/{humId}/uids` (owner だが非 admin)

**不変条件**:
- `status === 403`

**回帰元**: `architecture.md § 認可マトリクス`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-RESEARCH-23: GET /research/{humId}/dataset (リンク Dataset 一覧)

**endpoint**: `GET /research/{humId}/dataset`

**不変条件**:
- `status === 200`
- `data` は Dataset 配列
- public ユーザーは published 親の Dataset しか取れない (draft 親なら 404)
- owner/admin は draft 親の Dataset も取れる

**回帰元**: `routes/research/routes.ts § listLinkedDatasetsRoute`

**関連 unit テスト**: `tests/unit/api/routes/research/index.test.ts`

### IT-RESEARCH-24: POST /research/{humId}/dataset/new (owner) で Dataset 作成

**endpoint**: `POST /research/{humId}/dataset/new` body: `{}` (owner、親 Research が draft)

**不変条件**:
- `status === 201`
- `data.datasetId` は `DRAFT-{humId}-{uuid}` 形式
- `data.releaseDate` は今日の ISO 8601 date
- `data.criteria === "Controlled-access (Type I)"`
- `data.experiments === []`
- 親 Research の `ResearchVersion.datasets` に追加される

**回帰元**: `docs/api-guide.md § Create Dataset for Research の初期化挙動`

**関連 unit テスト**: `tests/unit/api/types/request-schemas.test.ts`

### IT-RESEARCH-25: POST /research/{humId}/dataset/new は親が draft でないと 409

**endpoint**: `POST /research/{published_humId}/dataset/new` (owner)

**不変条件**:
- `status === 409`
- `detail` に「parent Research must be in draft」相当

**回帰元**: `architecture.md § Dataset の status 依存`

**関連 unit テスト**: `tests/unit/api/es-client/dataset.test.ts`

### IT-RESEARCH-26: includeRawHtml=true で rawHtml フィールドが返る

**endpoint**: `GET /research/{humId}?includeRawHtml=true`

**不変条件**:
- レスポンスの TextValue 系フィールドに `rawHtml` プロパティが含まれる
- crawler 由来データなら `rawHtml: string`、API 編集後なら `rawHtml: null`
- `includeRawHtml=false` (デフォルト) では `rawHtml` プロパティが除外される

**回帰元**: `docs/api-guide.md § rawHtml パラメータ`

**関連 unit テスト**: `tests/unit/api/utils/hydrate-raw-html.test.ts`

### IT-RESEARCH-27: POST /research/new body 全 optional 省略で 201 (default 適用)

**endpoint**: `POST /research/new` body: `{}` (admin)

**不変条件**:
- `status === 201`
- `data.humId` 自動採番
- `data.status === "draft"`、`data.latestVersion === null`、`data.draftVersion === "v1"`
- `data.title` 等の TextValue 系は spec の default (例: `{ ja: { text: null, rawHtml: null }, en: ... }`)
- `data.uids === []`
- 直後の GET (admin) で同じ shape

**回帰元**: `routes/research/routes.ts § createResearchRoute § "All fields are optional"`

**関連 unit テスト**: `tests/unit/api/types/request-schemas.test.ts` (CreateResearchRequestSchema default 検証)

---

## IT-WORKFLOW-*: ワークフロー (状態遷移)

`POST /research/{humId}/submit|approve|reject|unpublish` の遷移、from 状態が違う場合に 409、`datePublished` の初回 approve 設定・以後保持、`dateModified` の更新、unpublish 時 `latestVersion → draftVersion` 移動、approve 時 Dataset version 確定、認可 (owner/admin のみ)。

### IT-WORKFLOW-01: submit draft→review (owner)

**endpoint**: `POST /research/{draft_humId}/submit` (owner token)

**不変条件**:
- `status === 200`
- レスポンスの `data.status === "review"`
- `data.dateModified` が事前 GET より新しい
- `data.latestVersion` / `data.draftVersion` は **変化しない**

**回帰元**: `architecture.md § 状態遷移テーブル § submit`

**関連 unit テスト**: `tests/unit/api/routes/research/workflow.test.ts` (computeVersionUpdates)

### IT-WORKFLOW-02: submit は非 owner で 403

**endpoint**: `POST /research/{draft_humId}/submit` (非 owner authenticated)

**不変条件**:
- `status === 403`

**回帰元**: `architecture.md § 認可マトリクス`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-WORKFLOW-03: submit は draft 以外で 409

**endpoint (parametrize)**:
- `POST /research/{review_humId}/submit` → 409
- `POST /research/{published_humId}/submit` → 409

**不変条件**:
- `title === "Conflict"`、`detail` に「expected 'draft'」相当

**回帰元**: `es-client/auth.ts § validateStatusTransition`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-WORKFLOW-04: approve review→published (admin)

**endpoint**: `POST /research/{review_humId}/approve` (admin、draftVersion=v1, datePublished=null)

**不変条件**:
- `status === 200`
- `data.status === "published"`
- `data.latestVersion === "v1"` (元の draftVersion)
- `data.draftVersion === null`
- `data.datePublished` は今日の date (初回 approve)
- 配下の Dataset の version が確定 (`GET /dataset/{datasetId}/versions` で v1 がリストに残る)

**回帰元**: `architecture.md § 状態遷移テーブル § approve` / `docs/api-guide.md § レビュー提出と承認`

**関連 unit テスト**: `tests/unit/api/routes/research/workflow.test.ts`

### IT-WORKFLOW-05: approve は datePublished 既存値を上書きしない

**endpoint**: `POST /research/{humId}/approve` (再公開シナリオ、`datePublished` 既存値あり)

**不変条件**:
- `data.datePublished` は元の値のまま (更新されない)

**回帰元**: `architecture.md § 状態遷移テーブル § approve § 追加処理`

**関連 unit テスト**: `tests/unit/api/routes/research/workflow.test.ts` (PBT 既存)

### IT-WORKFLOW-06: approve は非 admin で 403

**endpoint**: `POST /research/{humId}/approve` (owner だが非 admin)

**不変条件**:
- `status === 403`

**回帰元**: `architecture.md § 認可マトリクス`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-WORKFLOW-07: approve は review 以外で 409

**endpoint (parametrize)**:
- `POST /research/{draft_humId}/approve` → 409
- `POST /research/{published_humId}/approve` → 409

**不変条件**:
- `title === "Conflict"`、`detail` に「expected 'review'」相当

**回帰元**: `es-client/auth.ts § validateStatusTransition`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-WORKFLOW-08: reject review→draft (admin)

**endpoint**: `POST /research/{review_humId}/reject` (admin)

**不変条件**:
- `status === 200`
- `data.status === "draft"`
- `data.latestVersion` / `data.draftVersion` は **変化しない**
- `data.dateModified` は更新される

**回帰元**: `architecture.md § 状態遷移テーブル § reject`

**関連 unit テスト**: `tests/unit/api/routes/research/workflow.test.ts`

### IT-WORKFLOW-09: reject は review 以外で 409

**endpoint**: `POST /research/{draft_humId}/reject` (admin)

**不変条件**:
- `status === 409`

**回帰元**: `es-client/auth.ts § validateStatusTransition`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-WORKFLOW-10: unpublish published→draft (admin)

**endpoint**: `POST /research/{published_humId}/unpublish` (admin、latestVersion=v2, draftVersion=null)

**不変条件**:
- `status === 200`
- `data.status === "draft"`
- `data.latestVersion === null`
- `data.draftVersion === "v2"` (元の latestVersion が移動)
- `data.datePublished` は元の値のまま

**回帰元**: `architecture.md § 状態遷移テーブル § unpublish` / `routes/research/workflow.test.ts § unpublish swaps latestVersion to draftVersion`

**関連 unit テスト**: `tests/unit/api/routes/research/workflow.test.ts`

### IT-WORKFLOW-11: unpublish は published 以外で 409

**endpoint**: `POST /research/{draft_humId}/unpublish` (admin)

**不変条件**:
- `status === 409`

**回帰元**: `es-client/auth.ts § validateStatusTransition`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-WORKFLOW-12: 楽観的ロック違反で 409 (全 workflow action)

**endpoint**: 各 workflow action に対し、古い `_seq_no` で同時に 2 回叩く (二度目)

**不変条件**:
- 2 度目のリクエストが `status === 409`
- `dateModified` は 1 度目の更新時刻

**回帰元**: `docs/api-guide.md § 楽観的ロックの使い方`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-WORKFLOW-13: unpublish 後の Research も public に非表示

**endpoint**: unpublish 後の `GET /research/{humId}` (public)

**不変条件**:
- `status === 404` (latestVersion=null になっているので公開条件を満たさない)
- admin GET では 200、`data.status === "draft"`

**回帰元**: `architecture.md § 公開条件` (`latestVersion != null AND status != "deleted"`)

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

### IT-WORKFLOW-14: deleted Research に対する workflow action は 404

**endpoint (parametrize)**: submit/approve/reject/unpublish (deleted humId に対し、admin)

**不変条件**:
- 全て `status === 404` (loadResearchAndAuthorize が deleted で 404 を返すため)

**回帰元**: `middleware/resource-auth.ts § deleted check` / `architecture.md § deleted 状態`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-WORKFLOW-15: 各 action 後の dateModified が単調増加

**endpoint**: submit → approve → ... を順に実行し、それぞれ前後で GET

**不変条件**:
- `new Date(after.dateModified) >= new Date(before.dateModified)`
- 連続 4 action (submit/approve/unpublish/submit) でも単調非減少
- 実時間が同 ms に収まった場合のみ等号

**回帰元**: `architecture.md § 状態遷移テーブル § 追加処理 (dateModified 更新)`

**関連 unit テスト**: `tests/unit/api/es-client/research.test.ts`

### IT-WORKFLOW-16: submit → reject → submit のサイクルで状態が一貫

**endpoint**: 3 連続で `submit` → `reject` → `submit` (owner + admin で交互)

**不変条件**:
- 最終状態 `data.status === "review"`
- `latestVersion` / `draftVersion` は最初から変わらない (submit/reject は version 不変)
- 累積で stale (`_seq_no` 不一致) にならず、3 回とも 200 で通る
- `dateModified` は 3 回更新される

**回帰元**: `es-client/auth.ts § validateStatusTransition` / `architecture.md § 状態遷移テーブル`

**関連 unit テスト**: `tests/unit/api/es-client/auth.test.ts`

---

## IT-VERSION-*: バージョン管理

Research 側: `GET /research/{humId}/versions`、`GET /research/{humId}/versions/{version}`、`POST /research/{humId}/versions/new` (published のみ、前バージョン Dataset コピー)、public からの version 範囲制限。
Dataset 側: 「初回更新で version bump」「2 回目以降は上書き」「draft Research の dataset list 自動更新」。

### IT-VERSION-01: GET /research/{humId}/versions 正常応答

**endpoint**: `GET /research/{multi_version_humId}/versions`

**不変条件**:
- `status === 200`
- `data` は version 配列 `[{ version, versionReleaseDate, releaseNote, datasets }, ...]`
- `parseVersionNum(version)` の昇順 (v1, v2, v3, ...) で並ぶ

**回帰元**: `docs/api-guide.md § バージョン指定` / `versions.ts § listResearchVersionsSorted`

**関連 unit テスト**: `tests/unit/api/utils/version.test.ts`

### IT-VERSION-02: GET /research/{humId}/versions の範囲制限 (public)

**endpoint**: `GET /research/{humId}/versions` (public、latestVersion=v2, draftVersion=v3)

**不変条件**:
- `data` に v1 と v2 のみ含まれる (v3 は除外)
- owner/admin で叩けば v1, v2, v3 が含まれる

**回帰元**: `architecture.md § バージョン解決ルール § バージョン一覧`

**関連 unit テスト**: `tests/unit/api/utils/version.test.ts`

### IT-VERSION-03: GET /research/{humId}/versions/{version} 正常応答

**endpoint**: `GET /research/{humId}/versions/v1`

**不変条件**:
- `status === 200`
- `data.version === "v1"`
- `data` は read-only response shape (`humId`, `humVersionId`, `version`, `versionReleaseDate`, `releaseNote`, `datasets`)
- `meta._seq_no` / `meta._primary_term` は含まれない (`singleReadOnlyResponse` 経由)

**回帰元**: `docs/api-guide.md § バージョン指定`

**関連 unit テスト**: `tests/unit/api/types/draft-version-schemas.test.ts`

### IT-VERSION-04: 存在しない version は 404

**endpoint**: `GET /research/{humId}/versions/v999`

**不変条件**:
- `status === 404`

**回帰元**: `versions.ts § getVersionRoute`

**関連 unit テスト**: `tests/unit/api/utils/version.test.ts`

### IT-VERSION-05: public は latestVersion 超の version 直接指定で 404

**endpoint**: `GET /research/{humId}/versions/v3` (public、latestVersion=v2)

**不変条件**:
- `status === 404`
- owner/admin では 200 を返す

**回帰元**: `architecture.md § バージョン解決ルール § バージョン直接指定時`

**関連 unit テスト**: `tests/unit/api/utils/version.test.ts`

### IT-VERSION-06: POST /research/{humId}/versions/new (owner, published 状態)

**endpoint**: `POST /research/{published_humId}/versions/new` body: `{}` (owner)

**不変条件**:
- `status === 201`
- `data.version === "v<N+1>"` (元の latestVersion+1)
- 直後の admin GET で `latestVersion === <元の値>`、`draftVersion === <新 version>`、`status === "draft"`
- 元の latestVersion の Dataset 群が新 draft version の dataset list に自動コピーされる
- public は依然として元の latestVersion を閲覧できる

**回帰元**: `docs/api-guide.md § 公開済み Research の更新 (新バージョン作成)` / `architecture.md § 新バージョン追加フロー`

**関連 unit テスト**: `tests/unit/api/es-client/research-version.test.ts`

### IT-VERSION-07: POST /research/{humId}/versions/new は published 以外で 409

**endpoint (parametrize)**:
- `POST /research/{draft_humId}/versions/new` → 409
- `POST /research/{review_humId}/versions/new` → 409

**不変条件**:
- `title === "Conflict"`、`detail` に「expected 'published'」相当

**回帰元**: `versions.ts § createVersionRoute § draft check`

**関連 unit テスト**: `tests/unit/api/routes/research/versions.test.ts`

### IT-VERSION-08: POST /research/{humId}/versions/new は非 owner で 403

**endpoint**: `POST /research/{published_humId}/versions/new` (非 owner authenticated)

**不変条件**:
- `status === 403`

**回帰元**: `architecture.md § 認可マトリクス`

**関連 unit テスト**: `tests/unit/api/middleware/resource-auth.test.ts`

### IT-VERSION-09: Dataset の初回更新で version bump

**endpoint**: 新 draft version 作成後の `PUT /dataset/{datasetId}/update` (owner)

**不変条件**:
- 直後の `GET /dataset/{datasetId}` で `data.version === "v<N+1>"` (前 v1 → v2)
- `GET /dataset/{datasetId}/versions` で v1, v2 両方が見える
- 親 Research の `draftVersion` の datasets が v2 を参照

**回帰元**: `architecture.md § Dataset のバージョン § 新バージョン作成時のフロー § 2`

**関連 unit テスト**: `tests/unit/api/es-client/dataset.test.ts`

### IT-VERSION-10: Dataset の 2 回目以降の更新は同 version 上書き

**endpoint**: 同じ draft cycle 内で `PUT /dataset/{datasetId}/update` を 2 回叩く

**不変条件**:
- 1 回目の更新で v1 → v2 になる
- 2 回目の更新で v2 のまま (新規 version 作成されない)
- `GET /dataset/{datasetId}/versions` で v2 が最新、その中身は 2 回目の内容

**回帰元**: `architecture.md § 「初回更新」の判定`

**関連 unit テスト**: `tests/unit/api/es-client/dataset.test.ts`

### IT-VERSION-11: Dataset 新規追加で draft Research の dataset list に自動追加

**endpoint**: draft Research に `POST /research/{humId}/dataset/new` (owner)

**不変条件**:
- 直後の `GET /research/{humId}/dataset` (admin) で新 Dataset が `data` に含まれる
- draft `ResearchVersion.datasets` に追加されている

**回帰元**: `architecture.md § Dataset のバージョン § 3. Dataset の追加`

**関連 unit テスト**: `tests/unit/api/es-client/research-version.test.ts`

### IT-VERSION-12: approve 時に Dataset version が確定

**endpoint**: draft Research を approve 後、当時の Dataset version を取得

**不変条件**:
- approve 後の `GET /dataset/{datasetId}` で `data.version === <approve 時点の version>`
- `GET /research/{humId}/versions/{approved_version}` の `datasets[]` に当該 Dataset の version 参照が pin される
- 以後 Dataset を更新しても (新 cycle で) その version 参照は不変

**回帰元**: `docs/api-guide.md § レビュー提出と承認 § 4a` / `architecture.md § Dataset のバージョン § 5`

**関連 unit テスト**: `tests/unit/api/es-client/research-version.test.ts`

### IT-VERSION-13: バージョン番号の単調増加

**endpoint**: 連続して `POST /research/{humId}/versions/new` (approve 経由)

**不変条件**:
- v1 → v2 → v3 → ... と単調増加
- 削除や巻き戻しはできない (試みた場合は 4xx)

**回帰元**: `architecture.md § バージョン番号`

**関連 unit テスト**: `tests/unit/api/utils/version.test.ts`

### IT-VERSION-14: POST /research/{humId}/versions/new の楽観的ロック失敗で 409

**endpoint**: `POST /research/{published_humId}/versions/new` を古い `_seq_no` で 2 回叩く (二度目)

**不変条件**:
- 2 度目: `status === 409`
- `title === "Conflict"`、RFC 7807 形式
- 1 度目の draft Research は変更されない (`latestVersion` / `draftVersion` が壊れない)

**回帰元**: `versions.ts § createVersionRoute § ConflictError fallback`

**関連 unit テスト**: `tests/unit/api/es-client/research-version.test.ts`

---

## IT-JGA-*: JGA 申請

`GET /jga-shinsei/ds` / `GET /jga-shinsei/ds/{jdsId}` / `GET /jga-shinsei/du` / `GET /jga-shinsei/du/{jduId}`、admin 認証必須、PII フィールドが noindex、page/limit (最大 100)、J-DS / J-DU フォーマット検証、空入力で SQL を発行しない、NotFoundError 投擲。

> **staging 専用**: PostgreSQL は NIG ネットワーク内、Keycloak admin token も staging。接続不可なら IT-JGA-* は全 skip。

### IT-JGA-01: GET /jga-shinsei/ds は未認証で 401

**endpoint**: `GET /jga-shinsei/ds` (Authorization なし)

**不変条件**:
- `status === 401`

**回帰元**: `routes/jga-shinsei.ts § requireAuth + requireAdmin`

**関連 unit テスト**: `tests/unit/api/routes/jga-shinsei.test.ts`

### IT-JGA-02: GET /jga-shinsei/ds は非 admin で 403

**endpoint**: `GET /jga-shinsei/ds` (non-admin authenticated)

**不変条件**:
- `status === 403`

**回帰元**: `architecture.md § 認可マトリクス`

**関連 unit テスト**: `tests/unit/api/routes/jga-shinsei.test.ts`

### IT-JGA-03: GET /jga-shinsei/ds 正常応答 (admin)

**endpoint**: `GET /jga-shinsei/ds?page=1&limit=10` (admin token)

**不変条件**:
- `status === 200`
- `data` は配列 (J-DS application の集約結果)
- `meta.pagination.page === 1`、`meta.pagination.limit === 10`、`meta.pagination.total >= 0`
- `data.length <= 10`、`data.length <= total`
- 各 item の `jdsId` が `J-DS\d+` 形式

**回帰元**: `docs/api-guide.md § JGA 申請管理 API § DS`

**関連 unit テスト**: `tests/unit/api/db-client/jga-shinsei.test.ts`

### IT-JGA-04: GET /jga-shinsei/ds のページネーション境界

**endpoint**: `GET /jga-shinsei/ds?page=<P>&limit=<L>` (admin)

**不変条件 (parametrize)**:
- `(P=1, L=1)`: 200
- `(P=1, L=100)`: 200
- `(P=1, L=101)`: 400
- `(P=0, L=20)`: 400
- 大きすぎる `P`: 200、`data` 空配列

**回帰元**: `docs/api-guide.md § JGA 申請管理 API` (page/limit 最大 100)

**関連 unit テスト**: `tests/unit/api/db-client/jga-shinsei.test.ts`

### IT-JGA-05: GET /jga-shinsei/ds/{jdsId} 正常応答

**endpoint**: `GET /jga-shinsei/ds/{existing_jdsId}` (admin)

**不変条件**:
- `status === 200`
- `data.jdsId === <input>`
- `DsApplicationTransformedSchema` で validate 可能
- `meta._seq_no` / `meta._primary_term` は含まれない (`singleReadOnlyResponse`)

**回帰元**: `apps/backend/jga-shinsei/docs/output-schema.md`

**関連 unit テスト**: `tests/unit/api/db-client/jga-shinsei.test.ts`

### IT-JGA-06: GET /jga-shinsei/ds/{jdsId} 不在 ID は 404

**endpoint**: `GET /jga-shinsei/ds/J-DS999999` (存在しない)

**不変条件**:
- `status === 404`
- RFC 7807 形式、`title === "Not Found"`

**回帰元**: `db-client/jga-shinsei.ts § getDsApplication § NotFoundError`

**関連 unit テスト**: `tests/unit/api/db-client/jga-shinsei.test.ts § getDsApplication throws NotFoundError`

### IT-JGA-07: jdsId フォーマット検証 (J-DS prefix)

**endpoint**: `GET /jga-shinsei/ds/invalid-id` (admin)

**不変条件**:
- `status === 400` または `404` (Zod の `JdsIdParamsSchema` で 400 が出る想定。実装次第で記載確定)
- 入力が `J-DS` で始まらないと弾く

**回帰元**: `docs/api-guide.md § JGA § jdsId フォーマット`

**関連 unit テスト**: `tests/unit/api/types/request-schemas.test.ts` (JdsIdParamsSchema)

### IT-JGA-08: GET /jga-shinsei/du の admin 必須

**endpoint (parametrize)**:
- 未認証: `GET /jga-shinsei/du` → 401
- 非 admin: 403
- admin: 200

**不変条件**: IT-JGA-01〜02 と同じ

**回帰元**: `routes/jga-shinsei.ts`

**関連 unit テスト**: `tests/unit/api/routes/jga-shinsei.test.ts`

### IT-JGA-09: GET /jga-shinsei/du/{jduId} の data shape

**endpoint**: `GET /jga-shinsei/du/{existing_jduId}` (admin)

**不変条件**:
- `data.jduId === <input>`
- `DuApplicationTransformedSchema` で validate 可能
- PII フィールド (電話番号、メール、住所等) は `data` に **含まれる** が ES には noindex として格納されているため検索対象外 (検索系シナリオで確認)

**回帰元**: `docs/api-guide.md § JGA § PII フィールドは ES に格納されるが検索対象外`

**関連 unit テスト**: `tests/unit/api/db-client/jga-shinsei.test.ts`

### IT-JGA-10: db-client は空 ID 配列で SQL を発行しない

**endpoint**: 直接呼び出し (`fetchDsRaw([])`, `fetchDuRaw([])`)

**不変条件**:
- 戻り値は `[]`
- SQL ログに WITH CTE クエリが残らない
- > 注: integration ではなく unit (mock SQL spy) で検証する方が適切

**回帰元**: `db-client/jga-shinsei.ts § fetchDsRaw § if (jdsIds.length === 0) return []`

**関連 unit テスト**: `tests/unit/api/db-client/jga-shinsei.test.ts § fetchDsRaw returns empty array for empty input without issuing SQL`

### IT-JGA-11: db-client は data_type で DS/DU を区別する

**endpoint**: `GET /jga-shinsei/ds` と `GET /jga-shinsei/du` を同パラメータで実行

**不変条件**:
- 両エンドポイントが返す `data[]` の `jdsId` / `jduId` 集合は **互いに素**
- 同じ ID 値が両側に現れない (data_type=1 vs data_type=2 の分離)

**回帰元**: `db-client/jga-shinsei.ts § DATA_TYPE` / `apps/backend/jga-shinsei/docs/database-schema.md`

**関連 unit テスト**: `tests/unit/api/db-client/jga-shinsei.test.ts § listIds uses dataType=2 for J-DU`

---

## IT-ADMIN-*: 管理 API

`GET /admin/is-admin` (authenticated 必須、admin 判定が admin\_uids.json と照合)。

### IT-ADMIN-01: GET /admin/is-admin は未認証で 401

**endpoint**: `GET /admin/is-admin` (Authorization なし)

**不変条件**:
- `status === 401`
- RFC 7807 形式

**回帰元**: `routes/admin.ts § requireAuth`

**関連 unit テスト**: なし

### IT-ADMIN-02: GET /admin/is-admin (authenticated 非 admin) で `isAdmin: false`

**endpoint**: `GET /admin/is-admin` (non-admin authenticated)

**不変条件**:
- `status === 200`
- `data.isAdmin === false`
- `meta.requestId` / `meta.timestamp` あり

**回帰元**: `docs/api-guide.md § その他 § GET /admin/is-admin`

**関連 unit テスト**: なし

### IT-ADMIN-03: GET /admin/is-admin (admin) で `isAdmin: true`

**endpoint**: `GET /admin/is-admin` (admin token)

**不変条件**:
- `data.isAdmin === true`

**回帰元**: `architecture.md § 管理者判定`

**関連 unit テスト**: なし

### IT-ADMIN-04: admin\_uids.json 更新後のキャッシュ反映

**endpoint**: admin\_uids.json を更新後、しばらくして `GET /admin/is-admin`

**不変条件**:
- ADMIN\_UIDS の TTL (CACHE\_TTL.ADMIN\_UIDS) を超えると新しい admin リストが反映される
- TTL 内は古いリストで判定される
- > 注: 検証はキャッシュ TTL に依存するため integration では再現困難。unit で TTL モック推奨

**回帰元**: `middleware/auth.ts § adminUidsCache`

**関連 unit テスト**: `tests/unit/api/middleware/auth.test.ts`
