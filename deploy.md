# Deploy Guide

HumanDBs のデプロイ手順。

## 前提条件

- Docker または Podman がインストールされていること
- Docker Compose または podman-compose が利用可能であること

## ネットワーク作成（初回のみ）

```bash
docker network create humandbs-network
```

Podman の場合:

```bash
podman network create humandbs-network
```

## 環境別デプロイ

### 開発環境

```bash
cp env.dev .env
docker compose up -d --build
docker compose exec backend bash
```

### ステージング環境

```bash
cp env.staging .env
docker compose up -d --build
```

### 本番環境

```bash
cp env.production .env
docker compose up -d --build
```

## Podman での起動

```bash
cp env.dev .env  # または env.staging, env.production
podman-compose -f compose.yml -f compose.override.podman.yml up -d
```

## 環境変数

環境変数は `.env` ファイルから読み込まれる。`env.dev`, `env.staging`, `env.production` のいずれかをコピーして使用する。

| 変数名 | 説明 |
|--------|------|
| `CONTAINER_PREFIX` | コンテナ名のプレフィックス |
| `NETWORK_NAME` | Docker ネットワーク名 |
| `DB_BIND_HOST` | DB ポートのバインドホスト |
| `FRONTEND_BIND_HOST` | フロントエンドポートのバインドホスト |
| `NGINX_PORT` | Nginx のポート番号 |
| `ES_MEM_LIMIT` | Elasticsearch のメモリ制限 |
| `POSTGRES_USER` | PostgreSQL ユーザー名 |
| `POSTGRES_PASSWORD` | PostgreSQL パスワード |
| `POSTGRES_DB` | PostgreSQL データベース名 |
| `ELASTIC_PASSWORD` | Elasticsearch パスワード |
| `OIDC_ISSUER_URL` | OIDC プロバイダーの URL |
| `OIDC_CLIENT_ID` | OIDC クライアント ID |
| `OIDC_REDIRECT_URI` | OIDC リダイレクト URI |

## ボリューム

| ボリューム名 | 用途 |
|--------------|------|
| `node_modules` | ルートの node_modules |
| `frontend_node_modules` | フロントエンドの node_modules |
| `backend_node_modules` | バックエンドの node_modules |
| `eslint_config_node_modules` | ESLint 設定の node_modules |
| `cms-pgdata` | PostgreSQL データ |
| `es-data` | Elasticsearch データ |

## 検証

```bash
# 設定確認（.env がないとエラー）
docker compose config

# 起動確認
docker compose ps

# ログ確認
docker compose logs -f

# コンテナ内で作業
docker compose exec backend bash

# API サーバー起動（コンテナ内）
bun run dev

# ブラウザで確認
# http://localhost:5011
```

## 停止

```bash
docker compose down
```

ボリュームも削除する場合:

```bash
docker compose down -v
```
