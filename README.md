# HumanDBs

[NBDC ヒトデータベース](https://humandbs.dbcls.jp/) の検索・管理システム。

## システムアーキテクチャ

| サービス      | 役割                                         |
| ------------- | -------------------------------------------- |
| nginx         | リバースプロキシ（外部公開ポイント）         |
| frontend      | React フロントエンド                         |
| backend       | REST API サーバー + クローラー（Bun / Hono） |
| assistant-api | 申請支援アシスタントAI API（Python / FastAPI） |
| elasticsearch | 全文検索エンジン                             |
| cms-db        | PostgreSQL データベース                      |

## ネットワークアーキテクチャ

```plaintext
[Internet]
    |
    v
+-------------------------------------------------------+
|  nginx (port 80)                                      |
|  ${HUMANDBS_NGINX_BIND_HOST}:${HUMANDBS_NGINX_PORT}   |
+-------------------------------------------------------+
    |
    +--- /api/* ------> backend:8080
    |                       |
    |                       +---> elasticsearch:9200
    |                       |
    |                       +---> Auth (OIDC IdP)
    |
    +--- /* ----------> frontend:3000
                            |
                            +---> backend:8080 (API calls)
                            |
                            +---> assistant-api:8000 (AI assistant API calls)
                            |
                            +---> cms-db:5432 (PostgreSQL)
                            |
                            +---> Auth (OIDC IdP)
```

- **外部アクセス**: nginx のみが公開される
- **内部通信**: 全サービスは Docker ネットワーク経由でサービス名で通信

## ディレクトリ構成

```plaintext
apps/
├── backend/       # REST API + クローラー
├── assistant-api/  # 申請支援ワークフロー API
└── frontend/      # React フロントエンド
packages/
└── eslint-config/ # 共有 ESLint 設定
```

| ディレクトリ     | 説明                  | README                            |
| ---------------- | --------------------- | --------------------------------- |
| `apps/assistant-api/` | 申請支援アシスタントAI API | [README](apps/assistant-api/README.md) |
| `apps/backend/`  | REST API + クローラー | [README](apps/backend/README.md)  |
| `apps/frontend/` | React フロントエンド  | [README](apps/frontend/README.md) |

## 開発環境のセットアップ

### 前提条件

- Docker / Docker Compose（開発環境）
- Podman / podman-compose（ステージング・本番環境）

### Quick Start

```bash
# 環境ファイルをコピー
cp env.development .env

# bind mount 用ディレクトリを作成
mkdir -p humandbs-es-backup

# コンテナを起動
docker compose up -d --build

# backend コンテナに入る
docker compose exec backend bash

# frontend コンテナに入る
docker compose exec frontend bash
```

### Frontend-only 開発モード

ローカル backend / elasticsearch を起動せず、frontend をローカル CMS DB に接続しつつ、API はステージング環境
(`https://humandbs-staging.ddbj.nig.ac.jp/api`) を利用するモード。`compose.yml` ではなく
`compose.dev.yml` を明示的に使う。

```bash
# 環境ファイルをコピー
cp env.development .env

# frontend-only 構成を起動
docker compose -f compose.dev.yml up -d --build

# frontend コンテナに入る
docker compose -f compose.dev.yml exec frontend bash
```

このモードでは以下のサービスのみ起動する。

- `cms-db`
- `frontend`
- `assistant-api`
- `nginx`

API 接続先は `.env` の以下で切り替える。

```env
HUMANDBS_BACKEND_ORIGIN=https://humandbs-staging.ddbj.nig.ac.jp
HUMANDBS_BACKEND_BASE_URL=${HUMANDBS_BACKEND_ORIGIN}/api
```

`nginx.dev.conf.template` は `HUMANDBS_BACKEND_ORIGIN` を使って `/api/` をプロキシし、frontend の
server-side fetch は `HUMANDBS_BACKEND_BASE_URL` を使う。

### 管理者設定

管理者権限を持つユーザーは `admin_uids.json` に Keycloak の `sub` (UID) を列挙する。`admin_uids.json` は機密情報のため Git にコミットしない。設定手順・UID 取得スクリプト・Keycloak クライアント設定の詳細は [docs/keycloak-admin.md](docs/keycloak-admin.md) を参照。

### Podman での起動

```bash
cp env.staging .env  # or env.production
cp compose.podman.yml compose.override.yml
mkdir -p humandbs-es-backup
podman-compose up -d --build
```

`compose.override.yml` は docker compose / podman-compose が自動マージするファイル名なので、`-f` の明示は不要。`compose.override.yml` は `.gitignore` で追跡対象外なので、環境ごとに中身を切り替えて使う。

### 環境ファイル

| ファイル          | 用途                  | `HUMANDBS_ENV` | `HUMANDBS_NODE_ENV` |
| ----------------- | --------------------- | -------------- | ------------------- |
| `env.development` | 開発環境（localhost） | `development`  | `development`       |
| `env.staging`     | ステージング環境      | `staging`      | `production`        |
| `env.production`  | 本番環境              | `production`   | `production`        |

いずれかを `.env` にコピーして使用する。
ステージング・本番環境では、コピー後に `HUMANDBS_POSTGRES_PASSWORD` などの認証情報を適切な値に編集する。

### Compose ファイル構成

`compose.yml` はフル構成、`compose.dev.yml` は frontend-only 開発構成として使う。
`compose.override.yml` を使う運用は Podman 用差分ファイルに限る。

| ファイル             | 役割                                                | 使い方                                                             |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `compose.yml`        | フル構成（frontend / backend / elasticsearch など） | `docker compose up -d --build`                                     |
| `compose.dev.yml`    | frontend-only 開発構成                              | `docker compose -f compose.dev.yml up -d --build`                  |
| `compose.podman.yml` | Podman 用の差分（`userns_mode` のみ）               | staging/production で `cp compose.podman.yml compose.override.yml` |

`compose.override.yml` 自体は `.gitignore` に入っており、Podman 環境でのローカル差分として使う。

### 環境変数

env テンプレート (`env.development` / `env.staging` / `env.production`) 自身が SSOT。各変数の意味・必須/任意・デフォルト値は templates 内のコメントで管理する。`.env` は gitignored なので、`cp env.<env> .env` で初期化してから運用に必要な値を埋める。

JGA 申請 API を有効化する場合、`HUMANDBS_JGA_DB_HOST` / `_USER` / `_PASSWORD` を `.claude/docs/jga-shinsei-db-access.md` の値で埋める。compose.yml で必須化されているため、未設定だとコンテナ起動が失敗する。

### Docker ボリューム

named volume は `humandbs-${HUMANDBS_ENV}-<名前>` で命名されるため、環境ごとに分離される（例: `humandbs-staging-cms-pgdata`）。

| キー                         | 用途                          | 実ボリューム名の例（staging）                 |
| ---------------------------- | ----------------------------- | --------------------------------------------- |
| `node_modules`               | ルートの node_modules         | `humandbs-staging-node-modules`               |
| `frontend_node_modules`      | フロントエンドの node_modules | `humandbs-staging-frontend-node-modules`      |
| `backend_node_modules`       | バックエンドの node_modules   | `humandbs-staging-backend-node-modules`       |
| `eslint_config_node_modules` | ESLint 設定の node_modules    | `humandbs-staging-eslint-config-node-modules` |
| `cms-pgdata`                 | PostgreSQL データ             | `humandbs-staging-cms-pgdata`                 |
| `es-data`                    | Elasticsearch データ          | `humandbs-staging-es-data`                    |

### 検証コマンド

```bash
# 設定確認（.env がないとエラー）
docker compose config

# frontend-only 構成の設定確認
docker compose -f compose.dev.yml config

# 起動確認
docker compose ps

# frontend-only 構成の起動確認
docker compose -f compose.dev.yml ps

# ログ確認
docker compose logs -f

# frontend-only 構成のログ確認
docker compose -f compose.dev.yml logs -f
```

### 停止・クリーンアップ

```bash
# 停止
docker compose down

# frontend-only 構成を停止
docker compose -f compose.dev.yml down

# ボリュームも削除する場合
docker compose down -v
```

## モノリポ構成

### Bun ワークスペース

- `package.json` の `workspaces: ["apps/*", "packages/*"]` で定義
- 共通依存関係はルートに、固有はワークスペースに配置

### package.json の階層

| 場所                     | 役割                   |
| ------------------------ | ---------------------- |
| `/`                      | ワークスペース定義のみ |
| `apps/backend`           | Backend 依存関係       |
| `apps/frontend`          | Frontend 依存関係      |
| `packages/eslint-config` | 共有 ESLint 設定       |

### tsconfig.json の継承構造

- ルート: 共通設定（ESNext, strict, bundler）
- 各アプリ: extends で継承 + 独自設定（paths, lib など）

### ESLint 設定の共有

- `packages/eslint-config`: base config を提供
- 各アプリ: import して拡張（React, Node.js 固有設定）
- ルート `eslint.config.mjs`: 全アプリを統合

## パッケージ管理

### 依存関係のインストール

1. **コンテナ内で**: `bun install <package>`
2. **ホスト側で**: `bun install --frozen-lockfile`

**注意**: `node_modules` はコンテナ・ホスト間で共有されない。
エディタ（VSCode など）が `node_modules` を必要とする場合は、ホスト側で `bun install --frozen-lockfile` を実行する。

### bun.lock の更新方法

ホストの Bun バージョンに依存せず、プロジェクト指定のバージョンで更新する:

```bash
rm -f bun.lock
docker run --rm -v "$(pwd):/app" -w /app oven/bun:1.3.5 bun install
```

## ドキュメント

- [Keycloak 管理設定](docs/keycloak-admin.md) - Keycloak クライアント設定、管理者設定
- [Elasticsearch バックアップ](docs/elasticsearch-backup.md) - Snapshot API によるバックアップ・リストア手順

## ライセンス

本プロジェクトは Apache License 2.0 の下で公開されている。詳細は [LICENSE](LICENSE) を参照。
