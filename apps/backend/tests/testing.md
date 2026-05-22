# テスト方針

HumanDBs Backend のテストの方針。整理した運用ノートとシナリオ列挙は別ファイルに分けている。

- 運用ノート (環境変数・fixture 戦略・件数 drift 対策): [integration-note.md](integration-note.md)
- Integration シナリオ列挙 (SSOT): [integration-scenarios.md](integration-scenarios.md)

## 目的

テストは **バグを見つけ、防ぐため** に書く。すべてのテストは「これが落ちたらどんなバグが検出されたことになるか」に答えられなければならない。通すために書くテスト、Happy path だけのテスト、アサーションのない smoke テストは書かない。

## 原則

- **仕様書駆動 / TDD**: `apps/backend/docs/` がその機能の SSOT。テストを実装より先に書く。Red → Green → Refactor
- **PBT (Property-Based Testing)**: TypeScript は `fast-check` を使う。不変条件・境界値・往復変換・状態遷移を網羅する
- **境界値・エッジケース・異常系を必ず書く**: 正常系だけでは脆い
- **Mock は外部境界だけ**: ES client / DB client (PostgreSQL) / Keycloak / FS / HTTP を境界として mock し、内部 (Zod スキーマ、レスポンス変換、Hono ルーティング、middleware) は実物を通す
- **テスト間の独立性**: 状態を共有しない、実行順序に依存しない
- **バグ修正は必ず回帰テストを残す**: `describe("Bug<N>: <title>", ...)` で分離し、PR/issue URL をコメントに残す

## テスト分類

3 バケツに分ける。

| 分類 | 場所 | 起動条件 | 説明 |
|---|---|---|---|
| **Unit** | `tests/unit/api/` | ES/DB/Keycloak 不要 | mock した外部境界に対して、Hono の `TestClient` (`app.request()`) でルーティングを通す。デフォルトの `bun test` 対象 |
| **Integration** | `tests/integration/api/` | 実 ES + 実 JGA PostgreSQL + (一部) 実 Keycloak | `compose.yml` のサービスに接続して E2E 検証。`bun run test:integration` で実行 |
| **Smoke** | `tests/smoke/` | デプロイ済み環境への HTTP 疎通 | `SMOKE_TEST_BASE_URL` を指定して real `fetch()`。読み取り専用エンドポイントのみ、認証必須は 401 確認のみ。`bun run test:smoke` で実行 |

> `tests/unit/crawler/` と `tests/unit/es/` は CLAUDE.md の **保守モード** 指示に従い、本ガイドの対象外として扱う (既存のまま維持)。

## ディレクトリ構成

`tests/unit/api/` は `src/api/` のディレクトリ構成・ファイル名と対応させる。

```plaintext
src/api/                       tests/unit/api/
├── routes/                    ├── routes/
│   ├── research/              │   ├── research/
│   │   ├── crud.ts            │   │   ├── crud.test.ts
│   │   ├── workflow.ts        │   │   └── workflow.test.ts
│   │   └── ...                │   ├── dataset.test.ts
│   ├── dataset.ts             │   └── ...
│   └── ...                    │
├── middleware/                ├── middleware/
│   └── auth.ts                │   └── auth.test.ts
├── es-client/                 ├── es-client/
│   └── query-builders.ts      │   └── query-builders.test.ts
└── types/                     └── types/
    └── request-schemas.ts         └── request-schemas.test.ts
```

特殊なテスト (複数ファイルにまたがるもの) は次のサフィックスを付ける。

| サフィックス | 用途 |
|---|---|
| `*-properties.test.ts` | PBT |
| `*-consistency.test.ts` | 整合性テスト (型 ↔ ES マッピング等) |
| `*-invariants.test.ts` | 不変条件 (workflow 状態遷移等) |

## 命名規則

`describe` で関心ごとに分け、`it` で「何を検証するか」を一文で書く。

```typescript
describe("api/<module>/<thing>", () => {
  describe("<function or feature>", () => {
    it("should <expected behavior> when <condition>", () => { ... })
  })

  describe("PBT", () => { /* PBT */ })

  describe("EdgeCases", () => { /* 境界値・異常系 */ })

  describe("Bug<N>: <title>", () => {
    // 回帰テスト。コメントに PR/issue URL を残す
  })
})
```

Integration テストでは関数の冒頭コメントに `// IT-XXX-NN` を残し、`integration-scenarios.md` と双方向トレース可能にする。

## Mock 戦略

外部境界 (ES client、PostgreSQL client、Keycloak JWKS、admin_uids.json、FS) の **レスポンスを mock** し、内部実装は実物を通す。

- **Mock する**: ES の検索/取得/書き込みレスポンス・version conflict・op_type:create の重複エラー、PostgreSQL クエリ結果、JWT 検証、admin UID ファイル
- **Mock しない**: Zod バリデーション、レスポンス変換 (`hydrate-raw-html`, `merge-searchable` 等)、Hono ルーティング、`requestIdMiddleware`、エラーハンドラ、`loadResearchAndAuthorize`

ルーターテストでは `app.request()` で HTTP リクエスト → レスポンスの全体を検証する。内部関数を個別に mock しない (リファクタで壊れるため)。

テストデータは crawler/api/es の Zod スキーマ (`EsResearchSchema`, `EsDatasetSchema` 等) を信頼して生成する。型の SSOT は `crawler/types → es/types → api/types` の依存方向に従う。

### bun:test `mock.module` の挙動と test:api の実行モデル

`mock.module()` は **プロセスグローバル** に振る舞い、同一プロセス内で複数ファイルが同じモジュールを mock すると **後勝ち** で干渉する。これを避けるため `test:api` はテストファイル毎に bun を新規起動する。

- `test:api`: 各 test ファイルを独立プロセスで実行 (推奨。mock 干渉なし、結果が安定)
- `test:api:bulk`: 全 test を 1 プロセスで一括実行 (高速だが、ファイル間で mock 状態が漏れる可能性あり)

CI と通常開発では `test:api` を使う。ローカルで素早く結果を見たいときだけ `test:api:bulk` を使う。

## レイヤー別観点

「どこに重点を置くか」の方針。具体的な不変条件は各テストコード自身が SSOT なので、ここには列挙しない。

- **types/ (Zod スキーマ)**: PBT を最大限活用する。`Pagination` の境界、`Lang` の Enum 受入/拒否、検索ボディの `filters` ネスト、`rawHtml` の strip 挙動、`TextValue` 系の null 許容
- **routes/**: `app.request()` で HTTP レベル検証。ステータスコード、`X-Request-ID` echo、Trailing slash、RFC 7807 形式、認証/認可ガード、楽観的ロックの 409
- **middleware/**: Keycloak の JWKS rotation・期限切れ・claim 検証、`loadResearchAndAuthorize` の owner/admin/draft/deleted パス、`request-id` の UUID 生成
- **es-client/**: ES クエリ DSL の構造を検証 (実 ES に接続せず構築結果を比較)。fuzziness, `multi_match`, prefix, `op_type:create`, `_seq_no/_primary_term` の組み立て
- **db-client/**: SQL の組み立て (COUNT/SELECT/CTE)、空入力で SQL を発行しない、NotFoundError 投擲
- **utils/**: `hydrate-raw-html` (null 注入)、`merge-searchable` (重複排除・順序)、`version` (採番・比較)
- **errors/**: `AppError` 派生のステータスコード・code・factory の値、`toProblemDetails` の RFC 7807 形式

## Integration テスト

実 ES (および JGA PostgreSQL) に対する E2E 検証。

- シナリオ列挙の SSOT: [integration-scenarios.md](integration-scenarios.md) (`IT-{機能}-{連番}` で識別)
- 環境準備・代表 ID・書き方ガイド (件数 drift 対策、staging marker、CI): [integration-note.md](integration-note.md)

固定値 assert (`total === 26537` 等) は **書かない**。converter/crawler の更新で件数が変わるため。代わりに構造的不変条件 (set 一致、相対比較、最小保証) で書く。詳細は [integration-note.md § 件数 drift 対策](integration-note.md#件数-drift-対策)。

### ES index 上書き (test 分離)

ES クライアントは `HUMANDBS_ES_INDEX_RESEARCH` / `HUMANDBS_ES_INDEX_RESEARCH_VERSION` / `HUMANDBS_ES_INDEX_DATASET` で参照する index 名を上書きできる (デフォルトは `research` / `research-version` / `dataset`、定義は `src/api/es-client/client.ts`)。`test:integration` は package.json で `*-it` 接尾辞付き (`research-it` / `research-version-it` / `dataset-it`) を設定し、本番 / 開発用 index と分離する。

本番 env テンプレ (`env.<env>`) には書かない。テスト実行系のみが扱う変数として位置づける。

## バグ回帰テスト

修正したバグは `describe("Bug<N>: <短い説明>", ...)` で再発防止テストを書く。issue / PR URL を冒頭コメントに残し、なぜそのテストがあるかを後から辿れるようにする。

```typescript
describe("Bug42: research list ignored lang=en for title", () => {
  // https://github.com/dbcls/humandbs/issues/42
  it("should return title.en when lang=en is specified", async () => { ... })
})
```

## 保守モード領域

`tests/unit/crawler/` と `tests/unit/es/` は CLAUDE.md の指示により保守モード扱い。

- 既存テストの修正は最小限に留める
- 新規テストは追加しない (既存挙動を保つ目的に限る)
- 本ガイドの「目的・原則・命名規則・Mock 戦略」は適用しない

## 実行コマンド

ランタイムは Bun。dev 環境では `docker compose exec backend bun ...` の形式で実行する。

```bash
# Unit (デフォルト)
docker compose exec backend bun run test              # test:api && test:es && test:crawler のチェーン (公式の入り口)
docker compose exec backend bun run test:api          # API のみ (テストファイル毎に独立プロセス、mock 干渉なし)
docker compose exec backend bun run test:api:bulk     # 1 プロセス一括実行 (高速だが mock.module 干渉あり)
# NOTE: `bun test` (npm script を bypass) は全ファイルを 1 プロセスで実行するため
# mock.module() がファイル間で leak して fail する。必ず `bun run test` 経由で実行する。

# Integration (実 ES + 実 DB 必要)
docker compose exec backend bun run test:integration

# Smoke (デプロイ先 URL を指定)
SMOKE_TEST_BASE_URL=https://humandbs-staging.ddbj.nig.ac.jp/api \
  bun run test:smoke

# 保守モード (通常は実行しない)
docker compose exec backend bun run test:crawler
docker compose exec backend bun run test:es
```

## 目標メトリクス

| 項目 | 目標 |
|---|---|
| Unit 実行時間 (`bun run test:api`) | 15 秒以下 |
| Integration 実行時間 | 60 秒以下 (ES 接続が支配的) |
| Flaky テスト | 0 件 |
| カバレッジ | 主要パス 80%+ (カバレッジは目標ではなく結果指標) |

## 関連リンク

- [integration-note.md](integration-note.md) — 環境変数・fixture・件数 drift 対策・CI
- [integration-scenarios.md](integration-scenarios.md) — IT-XXX-NN シナリオ列挙 SSOT
- [apps/backend/docs/api-guide.md](../docs/api-guide.md) — API 仕様 SSOT
- [apps/backend/docs/architecture.md](../docs/architecture.md) — アーキテクチャ
- [apps/backend/docs/data-model.md](../docs/data-model.md) — データモデル
