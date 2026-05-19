# JGA Shinsei

JGA 申請システム (J-DS: データ提供申請、J-DU: データ利用申請) の PostgreSQL を per-request で直接クエリし、EAV → ネスト構造に変換した上で REST API として提供する。

## アーキテクチャ

```plaintext
[PostgreSQL DB] (jgadb / jgasys schema)
       |
       v  (per-request: SQL クエリ + transform)
[REST API]  (/jga-shinsei/ds, /jga-shinsei/du)
```

検索・フィルタ要件がないため、API リクエストごとに PostgreSQL を直接叩いてレスポンスを組み立てる。EAV → ネスト構造への変換は `src/crawler/processors/jga-shinsei/transform.ts` の純粋関数を共用する。

`scripts/dump-all-data.sh` は SQL リファレンス・手動デバッグ用のダンプスクリプトで、live API は経由しない。

### ソースコード配置

| パス | 内容 |
|------|------|
| `src/crawler/processors/jga-shinsei/transform.ts` | EAV → API フレンドリー変換 |
| `src/crawler/types/jga-shinsei.ts` | 型定義 (Zod スキーマ、SSOT) |
| `src/api/db-client/client.ts` | PostgreSQL シングルトン Pool (postgres.js) |
| `src/api/db-client/jga-shinsei.ts` | SQL クエリ + transform 適用 |
| `src/api/routes/jga-shinsei.ts` | API エンドポイント |
| `tests/unit/crawler/processors/jga-shinsei-*.test.ts` | 変換ロジックのユニットテスト |
| `tests/unit/api/db-client/jga-shinsei.test.ts` | クエリ関数のユニットテスト (sql クライアントモック) |
| `tests/integration/api/jga-shinsei.test.ts` | 実 DB に対する統合テスト |

## 環境変数

### dump スクリプト用 (`scripts/dump-all-data.sh` など、`apps/backend/jga-shinsei/.env` で設定)

| 変数名 | デフォルト | 説明 |
|--------|------------|------|
| `JGA_DB_HOST` | (必須) | PostgreSQL ホスト |
| `JGA_DB_PORT` | `5432` | PostgreSQL ポート |
| `JGA_DB_USER` | `postgres` | PostgreSQL ユーザー名 |
| `JGA_DB_PASSWORD` | (必須) | PostgreSQL パスワード |
| `JGA_DB_NAME` | `jgadb` | PostgreSQL データベース名 |
| `JGA_DB_SCHEMA` | `jgasys` | スキーマ名 |
| `JGA_OUTPUT_DIR` | `./json-data` | JSON 出力ディレクトリ |
| `JGA_CONTAINER_NAME` | `humandbs-jga-shinsei-db` | `dump-all-data-docker.sh` 用 container 名 |

### API サーバー用 (root の `.env` / `compose.yml` で設定)

| 変数名 | デフォルト | 説明 |
|--------|------------|------|
| `HUMANDBS_JGA_DB_HOST` | (必須) | PostgreSQL ホスト |
| `HUMANDBS_JGA_DB_PORT` | `5432` | PostgreSQL ポート |
| `HUMANDBS_JGA_DB_USER` | (必須) | PostgreSQL ユーザー名 |
| `HUMANDBS_JGA_DB_PASSWORD` | (必須) | PostgreSQL パスワード |
| `HUMANDBS_JGA_DB_NAME` | `jgadb` | PostgreSQL データベース名 |
| `HUMANDBS_JGA_DB_SCHEMA` | `jgasys` | スキーマ名 |

## 補助スクリプト・変換ロジック

ここから先のスクリプト・変換ロジック解説は live API の経路ではなく、デバッグおよび `transform.ts` の理解のためのリファレンス。

### 1. DB ダンプ (デバッグ用)

DB から全データを JSON ファイルにダンプする。live API はこのファイルを参照しない。

```bash
# 環境設定 (初回のみ)
cp env.template .env
vim .env

# ダンプ実行
./scripts/dump-all-data.sh
```

**出力ファイル:** (`$JGA_OUTPUT_DIR` 以下、デフォルト: `json-data/`)

| ファイル | 内容 |
|----------|------|
| `jga-relations.json` | ID マッピング + 階層関係 |
| `ds-applications.json` | J-DS (データ提供申請) 詳細 |
| `du-applications.json` | J-DU (データ利用申請) 詳細 |

### 1b. JGA <-> hum-id リレーション TSV ダンプ

`nbdc_application.hum_id` を起点に、JGAS/JGAD と hum-id のリレーションを preserve-format TSV として出力する。ddbj-search-converter の DBLink パイプラインに組み込むためのデータ。

```bash
./scripts/dump-jga-hum-relations.sh
```

**データの導出経路:**

```plaintext
nbdc_application.hum_id
  -> submission_permission -> submission -> entry -> relation
  -> accession (JGAS/JGAD)
  -> current_accession_status (accession_status = 2098186: public/live)
```

metadata XML の `nbdc_number` を経由しない経路で、担当者が DB に直接投入した hum_id を使用する。`current_accession_status` で公開済み (public/live) の accession のみに絞り込む。ステータスの詳細は [database-schema.md](docs/database-schema.md) を参照。

**出力ファイル:** (`$JGA_HUM_REL_OUTPUT_DIR` 以下、デフォルト: `~/jga-relation/`)

| ファイル | 内容 | 形式 |
|----------|------|------|
| `jga_study_hum_id.tsv` | JGAS ↔ hum-id (公開済みのみ) | ヘッダなし TSV 2カラム |
| `jga_dataset_hum_id.tsv` | JGAD ↔ hum-id (公開済みのみ) | ヘッダなし TSV 2カラム |

**運用:** a014 上で cron 実行し、出力 TSV を converter 環境に scp する想定。

### 2. EAV → API フレンドリー変換

DB の `nbdc_application_component` テーブル (および dump JSON の `components` 配列) は EAV (Entity-Attribute-Value) パターンで、そのままでは扱いにくい。`src/crawler/processors/jga-shinsei/transform.ts` で API フレンドリーなネスト構造に変換する。同じロジックは API でも per-request で適用される。

#### コンポーネントキー定義の生成

変換に必要な `component-keys.json` は Java ソースから生成する。Java ソース更新時のみ再実行が必要。

```bash
bun run scripts/convert-java-source.ts
```

| 入力 (java-source/) | 内容 |
|---------------------|------|
| `NbdcComponentKey.java` | Enum 定義。全キー名と `multiValue` フラグ |
| `messages.properties` | 日本語ラベル |
| `messages_en.properties` | 英語ラベル |

#### 変換ルール

- **snake_case → camelCase**: `pi_first_name` → `pi.firstName`
- **BilingualText マージ**: `aim` + `aim_en` → `{ ja, en }`
- **multiValue グループ紐付け**: 同一キーの複数値を index でオブジェクト配列化
- **ステータスラベル付与**: ステータスコードに日英ラベルを追加
- **Boolean 変換**: `"TRUE"` / `"ok"` → `true`

詳細は [出力スキーマ定義](docs/output-schema.md) を参照。

#### 変換前 (EAV)

```json
{
  "jds_id": "J-DS002495",
  "application": { "create_date": "2024-12-03T..." },
  "components": [
    { "key": "aim", "value": "ゲノム解析による..." },
    { "key": "aim_en", "value": "Genomic analysis..." },
    { "key": "pi_first_name", "value": "太郎" },
    { "key": "pi_first_name_en", "value": "Taro" },
    { "key": "collaborator_name", "value": "Alice" },
    { "key": "collaborator_name", "value": "Bob" }
  ],
  "status_history": [{ "status": 10, "date": "2024-12-03T..." }],
  "submit_date": "2024-12-03T..."
}
```

#### 変換後 (API フレンドリー)

```json
{
  "jdsId": "J-DS002495",
  "aim": { "ja": "ゲノム解析による...", "en": "Genomic analysis..." },
  "pi": {
    "firstName": { "ja": "太郎", "en": "Taro" },
    "institution": { "ja": "○○大学", "en": "XX University" }
  },
  "collaborators": [
    { "name": "Alice", "division": "..." },
    { "name": "Bob", "division": "..." }
  ],
  "statusHistory": [
    { "status": 10, "statusLabel": { "ja": "申請書類作成中", "en": "Preparing" }, "date": "..." }
  ],
  "createDate": "2024-12-03T..."
}
```

## API エンドポイント

API サーバーは `HUMANDBS_JGA_DB_*` 環境変数で指定された PostgreSQL に対し、リクエストごとに直接 SQL を発行する。バッチや事前インデックスは不要。

エンドポイント一覧と request / response schema は Swagger UI (`/api/docs`) を参照。全エンドポイント admin 認証必須。一覧系は `page` + `limit` ページネーションで `jdsId` / `jduId` 昇順。

## テスト

```bash
bun test
```

テストファイルは `tests/unit/crawler/processors/` 以下にある。

## 詳細ドキュメント

- [ID の種類と関係](docs/id-relationships.md)
- [データベーススキーマ](docs/database-schema.md)
- [出力スキーマ定義](docs/output-schema.md)

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
