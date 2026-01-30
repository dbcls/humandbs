# JGA Shinsei

JGA 申請システムのデータを利用して、ID 間の関係や申請情報を取得するツール群。

## ユースケース

1. **ID 間の関係取得**: JGA 系 ID (JGAS, JGAD, JSUB, hum_id, J-DS, J-DU) 間の関係を取得
2. **データ提供申請 (J-DS) 情報取得**: 任意の ID から関連する J-DS 申請の詳細を取得
3. **データ利用申請 (J-DU) 情報取得**: 任意の ID から関連する J-DU 申請の詳細を取得

## アーキテクチャ

DB にリアルタイムアクセスできないため、2 段階で処理する:

1. **Dump**: 日次バッチで DB から JSON ファイルを生成
2. **Fetch**: CLI で JSON を読み取りクエリを実行

```
[PostgreSQL DB]
       |
       v (dump-all-data.sh / 日次バッチ)
[$JGA_OUTPUT_DIR/*.json]
       |
       v (fetch-*.sh)
[クエリ結果]
```

## 環境変数

| 変数名 | デフォルト | 説明 |
|--------|------------|------|
| `JGA_CONTAINER_NAME` | `humandbs-jga-shinsei-db` | Docker container 名 |
| `JGA_DB_USER` | `postgres` | PostgreSQL ユーザー名 |
| `JGA_DB_NAME` | `jgadb` | PostgreSQL データベース名 |
| `JGA_OUTPUT_DIR` | `./json-data` | JSON 出力ディレクトリ |

## クイックスタート

### 1. 環境設定

```bash
# 環境設定ファイルを作成
cp env.template .env

# 接続先の DB コンテナに合わせて編集
vim .env
```

### 2. データのダンプ

```bash
./scripts/dump-all-data.sh
```

### 3. CLI でクエリ

```bash
# ID の関係を取得
./scripts/fetch-relation.sh JGAS000001
./scripts/fetch-relation.sh hum0273

# J-DS 申請情報を取得
./scripts/fetch-ds-info.sh J-DS002504
./scripts/fetch-ds-info.sh --format table hum0273

# J-DU 申請情報を取得
./scripts/fetch-du-info.sh J-DU006529
./scripts/fetch-du-info.sh --format table JGAD000001
```

## スクリプト

### dump-all-data.sh

DB から全データを JSON ファイルにダンプする。

```bash
./scripts/dump-all-data.sh
```

**出力ファイル:** (`$JGA_OUTPUT_DIR` 以下、デフォルト: `json-data/`)

| ファイル | 内容 |
|----------|------|
| `relations.json` | ID マッピング + 階層関係 |
| `ds-applications.json` | J-DS (データ提供申請) 詳細 |
| `du-applications.json` | J-DU (データ利用申請) 詳細 |

### fetch-relation.sh

任意の ID から関連する ID を取得する。

```bash
./scripts/fetch-relation.sh [--format json|table] <ID>
```

**対応 ID:**

- `hum0273` - hum_id
- `JSUB000481` - JGA 内部 Submission ID
- `JGAS000123`, `JGAD000123`, etc. - JGA ID
- `J-DS002504` - データ提供申請 ID
- `J-DU006529` - データ利用申請 ID

**例:**

```bash
# JSON 形式（デフォルト）
./scripts/fetch-relation.sh JGAS000001

# テーブル形式
./scripts/fetch-relation.sh --format table hum0273
```

### fetch-ds-info.sh

J-DS (データ提供申請) の詳細情報を取得する。

```bash
./scripts/fetch-ds-info.sh [--format json|table] <ID>
```

**対応 ID:**

- `J-DS002504` - 直接検索
- `JSUB000481` - JSUB から検索
- `hum0273` - hum_id から検索
- `JGAS000123`, `JGAD000123` - JGA ID から検索

### fetch-du-info.sh

J-DU (データ利用申請) の詳細情報を取得する。

```bash
./scripts/fetch-du-info.sh [--format json|table] <ID>
```

**対応 ID:**

- `J-DU006529` - 直接検索
- `JGAD000123` - JGAD から検索
- `JGAS000123` - JGAS から検索
- `hum0273` - hum_id から検索

## 出力形式

### JSON 形式（デフォルト）

```json
{
  "jds_id": "J-DS002504",
  "jsub_ids": ["JSUB000481"],
  "hum_ids": ["hum0273"],
  "application": {
    "study_title": "研究題目",
    "pi": { "last_name": "山田", ... }
  },
  ...
}
```

### テーブル形式

```
==================================================
J-DS ID: J-DS002504

【関連 ID】
  JSUB: JSUB000481
  hum_id: hum0273

【申請情報】
  研究題目: ...
  PI: 山田太郎 (○○大学)
```

## 詳細ドキュメント

- [ID の種類と関係](docs/id-relationships.md)
- [データベーススキーマ](docs/database-schema.md)

## 開発者向け

### デバッグ用 DB コンテナの起動

ローカルでデバッグする場合は、ダンプファイルから DB コンテナを起動できる。

```bash
# ダンプファイルを dumps/ に配置後:
docker run -d \
  --name humandbs-jga-shinsei-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=jgadb \
  -e JGA_DB_FILE=jgadb_staging_20250422.sql \
  -v "$(pwd)/initdb":/docker-entrypoint-initdb.d:ro \
  -v "$(pwd)/dumps":/dumps:ro \
  -p 127.0.0.1:5433:5432 \
  postgres:17
```

初回は 20GB のダンプインポートに時間がかかる（数十分〜数時間）。進捗は `docker logs -f humandbs-jga-shinsei-db` で確認。

### DB コンテナの管理

```bash
# 停止・削除
docker stop humandbs-jga-shinsei-db && docker rm humandbs-jga-shinsei-db

# ログ確認
docker logs -f humandbs-jga-shinsei-db

# psql で接続
docker exec -it humandbs-jga-shinsei-db psql -U postgres -d jgadb
```

### データ永続化

デフォルトではコンテナ削除時にデータも消える。永続化するにはボリュームを追加:

```bash
docker run -d \
  --name humandbs-jga-shinsei-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=jgadb \
  -e JGA_DB_FILE=jgadb_staging_20250422.sql \
  -v "$(pwd)/initdb":/docker-entrypoint-initdb.d:ro \
  -v "$(pwd)/dumps":/dumps:ro \
  -v humandbs-jga-shinsei-data:/var/lib/postgresql/data \
  -p 127.0.0.1:5433:5432 \
  postgres:17 \
  -c shared_buffers=256MB \
  -c work_mem=64MB
```
