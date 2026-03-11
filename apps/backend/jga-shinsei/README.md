# JGA Shinsei

JGA 申請システムのデータ (J-DS: データ提供申請、J-DU: データ利用申請) を取得・変換し、Elasticsearch 経由で API として提供するパイプライン。

## アーキテクチャ

```plaintext
[PostgreSQL DB]
       |
       v  (dump-all-data.sh / 日次バッチ)
[json-data/*.json]  (EAV パターン)
       |
       v  (transform)
[*-applications-transformed.json]  (API フレンドリー)
       |
       v  (load-jga-shinsei-docs)
[Elasticsearch]  (jga-shinsei-ds / jga-shinsei-du インデックス)
       |
       v  (API ルート)
[REST API]  (/jga-shinsei/ds, /jga-shinsei/du)
```

### ソースコード配置

| パス | 内容 |
|------|------|
| `src/crawler/processors/jga-shinsei/transform.ts` | EAV → API フレンドリー変換 |
| `src/crawler/processors/jga-shinsei/reverse-transform.ts` | API フレンドリー → EAV 逆変換 |
| `src/crawler/types/jga-shinsei.ts` | 型定義 (Zod スキーマ) |
| `src/es/load-jga-shinsei-docs.ts` | ES ドキュメントロード |
| `src/es/jga-shinsei-{common,ds,du}-schema.ts` | ES マッピングスキーマ |
| `src/api/routes/jga-shinsei.ts` | API エンドポイント |
| `src/api/es-client/jga-shinsei.ts` | ES クエリ関数 |
| `tests/unit/crawler/processors/jga-shinsei-*.test.ts` | テスト |

## 環境変数

| 変数名 | デフォルト | 説明 |
|--------|------------|------|
| `JGA_CONTAINER_NAME` | `humandbs-jga-shinsei-db` | Docker container 名 |
| `JGA_DB_USER` | `postgres` | PostgreSQL ユーザー名 |
| `JGA_DB_NAME` | `jgadb` | PostgreSQL データベース名 |
| `JGA_OUTPUT_DIR` | `./json-data` | JSON 出力ディレクトリ |

## パイプライン

### 1. DB ダンプ

DB から全データを JSON ファイルにダンプする。

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

### 2. EAV → API フレンドリー変換

DB ダンプの `components` 配列は EAV (Entity-Attribute-Value) パターンで、そのままでは扱いにくい。
`src/crawler/processors/jga-shinsei/transform.ts` で API フレンドリーなネスト構造に変換する。

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

### 3. Elasticsearch ロード

変換済み JSON を Elasticsearch にバルクインデックスする。

```bash
bun run es:load-jga-shinsei-docs
```

### 4. API エンドポイント

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | `/jga-shinsei/ds` | admin | DS 申請一覧 |
| GET | `/jga-shinsei/ds/{jdsId}` | admin | DS 申請詳細 |
| GET | `/jga-shinsei/du` | admin | DU 申請一覧 |
| GET | `/jga-shinsei/du/{jduId}` | admin | DU 申請詳細 |

## テスト

```bash
bun test
```

テストファイルは `tests/unit/crawler/processors/` 以下にある。

## 詳細ドキュメント

- [ID の種類と関係](docs/id-relationships.md)
- [データベーススキーマ](docs/database-schema.md)
- [出力スキーマ定義](docs/output-schema.md)
- [DB Insert API 仕様](docs/db-insert-api-spec.md)

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
