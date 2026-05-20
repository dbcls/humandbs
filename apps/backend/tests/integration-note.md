# Integration テスト運用ノート

シナリオ列挙は [integration-scenarios.md](integration-scenarios.md)、テスト方針は [testing.md](testing.md)。本書は **環境準備・fixture 戦略・件数 drift 対策・JGA DB / staging marker・CI** といった「どう運用するか」をまとめる。

## 接続切替

### Elasticsearch

```bash
# dev (compose)
docker compose exec backend bun run test:integration

# ローカル接続 (compose 外)
HUMANDBS_ES_HOST=localhost HUMANDBS_ES_PORT=9200 bun run test:integration
```

| 環境変数 | デフォルト | 用途 |
|---|---|---|
| `HUMANDBS_ES_HOST` | `elasticsearch` | ES ホスト |
| `HUMANDBS_ES_PORT` | `9200` | ES ポート |
| `HUMANDBS_BACKEND_URL_PREFIX` | (空) | リクエストパスの prefix。compose では `/api` |

session 開始時に `esClient.cluster.health()` で疎通確認し、unreachable なら関連テストを skip する (`itWithEs` ヘルパー)。

### JGA PostgreSQL

JGA 申請データは外部 PostgreSQL に存在する。詳細な接続情報は [.claude/docs/jga-shinsei-db-access.md](../../.claude/docs/jga-shinsei-db-access.md)。

| 環境変数 | デフォルト | 用途 |
|---|---|---|
| `HUMANDBS_JGA_DB_HOST` | (空) | PostgreSQL ホスト |
| `HUMANDBS_JGA_DB_PORT` | `5432` | ポート |
| `HUMANDBS_JGA_DB_USER` | (空) | ユーザー |
| `HUMANDBS_JGA_DB_PASSWORD` | (空) | パスワード |
| `HUMANDBS_JGA_DB_NAME` | `jgadb` | DB 名 |
| `HUMANDBS_JGA_DB_SCHEMA` | `jgasys` | schema (staging は `ts_jgasys`) |

> JGA DB は **ローカル環境からは直接接続できない** (NIG ネットワーク内のみ)。JGA 関連 integration テストは `@JGA` タグまたは環境変数チェックで分離し、接続不可なら session skip する (詳細は § JGA / staging 専用シナリオ)。

### Keycloak (OIDC)

| 環境変数 | デフォルト | 用途 |
|---|---|---|
| `HUMANDBS_AUTH_ISSUER_URL` | `https://idp-staging.ddbj.nig.ac.jp/realms/master` | OIDC issuer |
| `HUMANDBS_AUTH_CLIENT_ID` | `humandbs-dev` | OIDC audience |
| `HUMANDBS_BACKEND_ADMIN_UID_FILE` | (未設定 = 管理者なし) | admin UID JSON ファイル |

integration テストで実トークンを使う場合は staging Keycloak の credential を使う ([.claude/docs/staging-credentials.md](../../.claude/docs/staging-credentials.md))。トークン取得失敗時はテスト skip。

## ES の用意

`compose.yml` で起動する Elasticsearch を使う。converter / crawler の出力データを `bun run import:es` で投入した状態を前提とする。

```bash
docker compose up -d backend  # ES + backend が起動
docker compose exec backend bun run import:es  # データ投入 (初回のみ)
```

整備した integration テストは「ES に何かしらのデータが投入されている」前提で書く。データが空の場合は `total > 0` 系のアサーションが落ちる。テストは可能な限り「データが無ければ skip」する形で記述する (例: list で 1 件以上ヒットした場合のみ詳細を叩く)。

## fixture 戦略

read-only な integration テスト (search, facets, stats, ... 等) は、共有 ES に存在する代表データを **そのまま参照する**。代表 ID や代表ファセット値はテストファイルの先頭で定数化し、接続先のデータに該当が無い場合は当該テストを skip する。

| 系統 | 例 | 取得方法 |
|---|---|---|
| 代表 humId / datasetId | `latestVersion!=null` な Research、複数 version Research など | 実 ES への aggregation / count probe で実測 |
| type-specific facet の代表 bucket | `assayType=WGS` 等 | facet API で実測 |
| type-specific text-match の代表 token | `cancer` 等 | search API で実測 |
| JGA 申請の代表 ID | staging で参照可能な `J-DS*` / `J-DU*` | staging DB から実測 |

mutating な integration テスト (research / dataset / workflow / version の create/update/delete 系) は `tests/integration/api/mutating-helpers.ts` の共通ヘルパーを経由し、**isolation ES index** 上で実行する。

### 禁止事項

- **テスト用 doc を共有 ES に POST して setUp/tearDown する運用は禁止** (汚染リスクがあるため)
- 既存ドキュメントの値を変更するテストも禁止 (新規作成テストは isolation ES index 上に限る)

## 件数 drift 対策

ES / JGA DB のデータは converter / crawler / 外部システムの更新で件数が変わる。固定値 assert は壊れる前提で書かない。代わりに **構造的不変条件** で書く。

### NG: 件数固定

```typescript
// 来月にはずれる
expect(json.meta.pagination.total).toBe(120)
```

### OK: 相対比較 / set 一致 / 最小保証

```typescript
// 大文字小文字を変えても集合が一致
const lower = await fetch("/research/search", { body: { query: "cancer" } })
const upper = await fetch("/research/search", { body: { query: "CANCER" } })
expect(idsOf(upper)).toEqual(idsOf(lower))

// 相対比較で regression を検出
const all = await fetch("/research?limit=100")
const filtered = await fetch("/research/search", { body: { status: "published" } })
expect(filtered.meta.pagination.total).toBeLessThanOrEqual(all.meta.pagination.total)

// 隠匿 entry と存在しない entry が同じ 404 を返す (構造的不変条件)
const hidden = await fetch("/research/deleted-id")
const missing = await fetch("/research/__does_not_exist__")
expect(hidden.status).toBe(missing.status)
expect(hidden.status).toBe(404)
```

### 使ってよい assert パターン

- **set 一致**: `new Set(items.map(x => x.id))` ↔ 期待 ID 集合
- **相対比較**: `total_filtered <= total_all`、`total_filtered < total_all / 2`
- **最小保証**: `total > 0`、`items.length >= 1`
- **構造比較**: 2 つのレスポンスで対応するフィールドが一致
- **値の集合自体が SSOT のとき**: 固定値 assert 可 (例: `LANG_TYPES = ["ja", "en"]`、`ERROR_TYPE_URIS`)

`docs/api-guide.md` で値の集合自体が SSOT になっているもの (例: facet field 18 種、status の 4 値) は固定 set 一致を使ってよい。

## JGA / staging 専用シナリオ

`/jga-shinsei/*` の integration テストは **staging Keycloak の admin トークン** と **JGA PostgreSQL への到達性** を必要とする。ローカル/CI 環境では成立しないため分離する。

- 接続不可なら session skip (`require_value` ヘルパーで一括判定)

```typescript
const JGA_DB_REACHABLE = await checkJgaDb()  // 接続テスト
const jgaTest = JGA_DB_REACHABLE ? test : test.skip

jgaTest("IT-JGA-01: ...", async () => { ... })
```

## ID トレーサビリティ

Integration テスト関数の冒頭コメントに `IT-XXX-NN` を必ず明記する。

```typescript
test("returns 200 for /research with pagination", async () => {
  // IT-SEARCH-03
  ...
})
```

`integration-scenarios.md` 側にもこのテスト関数の path を「関連 unit テスト」欄に書くことで双方向トレースが成立する。

## CI

`bun run test` (= `test:api && test:es && test:crawler`) は `tests/unit/` のみを実行する。integration は手動 (`bun run test:integration`) で、運用は **dev で手動実行 → staging deploy 前に smoke** で行う。

GitHub Actions で integration を回すには、ES service container を `services:` で起動 + converter の最小データセットを bring-up する必要がある。JGA は staging 環境にしかないため、CI では skip するか staging への secure tunnel が要る。

## 実行コマンドまとめ

```bash
# 全 integration
docker compose exec backend bun run test:integration

# 特定カテゴリのみ
docker compose exec backend bun run test:integration tests/integration/api/search.test.ts

# JGA を除外 (ローカル / CI)
JGA_DB_ENABLED=false docker compose exec backend bun run test:integration

# Smoke (デプロイ後)
SMOKE_TEST_BASE_URL=https://humandbs-staging.ddbj.nig.ac.jp/api bun run test:smoke
```
