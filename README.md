# HumanDBs

[NBDC ヒトデータベース](https://humandbs.dbcls.jp/) の検索・管理システム。

## システムアーキテクチャ

| サービス | 役割 |
|---------|------|
| nginx | リバースプロキシ（外部公開ポイント） |
| frontend | React フロントエンド |
| backend | REST API サーバー + クローラー（Bun / Hono） |
| elasticsearch | 全文検索エンジン |
| cms-db | PostgreSQL データベース |

## ネットワークアーキテクチャ

```planetext
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
└── frontend/      # React フロントエンド
packages/
└── eslint-config/ # 共有 ESLint 設定
```

| ディレクトリ | 説明 | README |
|--------------|------|--------|
| `apps/backend/` | REST API + クローラー | [README](apps/backend/README.md) |
| `apps/frontend/` | React フロントエンド | [README](apps/frontend/README.md) |

## 開発環境のセットアップ

### 前提条件

- Docker / Docker Compose
- (Optional) Podman / podman-compose

### Quick Start

```bash
# 環境ファイルをコピー
cp env.dev .env

# bind mount 用ディレクトリを作成
mkdir -p humandbs-es-backup

# コンテナを起動
docker compose up -d --build

# backend コンテナに入る
docker compose exec backend bash

# frontend コンテナに入る
docker compose exec frontend bash
```

### 管理者設定

管理者権限を持つユーザーを設定するには、テンプレートをコピーして編集する:

```bash
cp admin_uids.template.json admin_uids.json
```

`admin_uids.json` に管理者の UID（Keycloak の sub）を設定:

```json
[
  "actual-admin-user-id-1",
  "actual-admin-user-id-2"
]
```

#### UID 取得スクリプト

Keycloak のユーザー名とパスワードから UID を取得するスクリプトを用意している:

```bash
# UID を取得して表示
./scripts/fetch_keycloak_uid.sh

# UID を取得して admin_uids.json に追記
./scripts/fetch_keycloak_uid.sh --append
```

このスクリプトは `.env` から Keycloak の設定を読み込み、対話的にユーザー名とパスワードを入力して UID を取得する。`curl` と `jq` が必要。

**注意**: `admin_uids.json` は機密情報を含むため Git にコミットしないこと。

### Podman での起動

```bash
cp env.dev .env
cp compose.override.podman.yml compose.override.yml
mkdir -p humandbs-es-backup
podman-compose up -d
```

### 環境ファイル

| ファイル | 用途 |
|---------|------|
| `env.dev` | 開発環境（localhost） |
| `env.staging` | ステージング環境 |
| `env.production` | 本番環境 |

いずれかを `.env` にコピーして使用する。
ステージング・本番環境では、コピー後に `HUMANDBS_POSTGRES_PASSWORD` などの認証情報を適切な値に編集する。

### 環境変数

| 変数名 | 説明 |
|--------|------|
| `HUMANDBS_CONTAINER_PREFIX` | コンテナ名のプレフィックス |
| `HUMANDBS_NETWORK_NAME` | Docker ネットワーク名 |
| `HUMANDBS_NODE_ENV` | 実行環境（development / production） |
| `HUMANDBS_TZ` | タイムゾーン |
| `HUMANDBS_NGINX_BIND_HOST` | Nginx ポートのバインドホスト |
| `HUMANDBS_NGINX_PORT` | Nginx のポート番号 |
| `HUMANDBS_ES_MEM_LIMIT` | Elasticsearch のメモリ制限 |
| `HUMANDBS_ES_JAVA_OPTS` | Elasticsearch の JVM オプション |
| `HUMANDBS_ES_BACKUP_PATH` | Elasticsearch バックアップパス |
| `HUMANDBS_POSTGRES_USER` | PostgreSQL ユーザー名 |
| `HUMANDBS_POSTGRES_PASSWORD` | PostgreSQL パスワード |
| `HUMANDBS_POSTGRES_DB` | PostgreSQL データベース名 |
| `HUMANDBS_AUTH_ISSUER_URL` | OIDC プロバイダーの URL |
| `HUMANDBS_AUTH_CLIENT_ID` | OIDC クライアント ID |
| `HUMANDBS_AUTH_REDIRECT_URI` | OIDC リダイレクト URI |
| `HUMANDBS_FRONTEND_COMMAND` | フロントエンドコンテナの起動コマンド |
| `HUMANDBS_BACKEND_COMMAND` | バックエンドコンテナの起動コマンド |
| `HUMANDBS_BACKEND_ADMIN_UID_FILE` | 管理者UID一覧ファイルのパス（絶対パス、オプション） |

### Docker ボリューム

| ボリューム名 | 用途 |
|--------------|------|
| `node_modules` | ルートの node_modules |
| `frontend_node_modules` | フロントエンドの node_modules |
| `backend_node_modules` | バックエンドの node_modules |
| `eslint_config_node_modules` | ESLint 設定の node_modules |
| `cms-pgdata` | PostgreSQL データ |
| `es-data` | Elasticsearch データ |

### 検証コマンド

```bash
# 設定確認（.env がないとエラー）
docker compose config

# 起動確認
docker compose ps

# ログ確認
docker compose logs -f
```

### 停止・クリーンアップ

```bash
# 停止
docker compose down

# ボリュームも削除する場合
docker compose down -v
```

## モノリポ構成

### Bun ワークスペース

- `package.json` の `workspaces: ["apps/*", "packages/*"]` で定義
- 共通依存関係はルートに、固有はワークスペースに配置

### package.json の階層

| 場所 | 役割 |
|------|------|
| `/` | ワークスペース定義のみ |
| `apps/backend` | Backend 依存関係 |
| `apps/frontend` | Frontend 依存関係 |
| `packages/eslint-config` | 共有 ESLint 設定 |

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

## ライセンス

本プロジェクトは Apache License 2.0 の下で公開されている。詳細は [LICENSE](LICENSE) を参照。
