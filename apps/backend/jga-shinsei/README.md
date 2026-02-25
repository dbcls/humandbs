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

```plaintext
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

```plaintext
==================================================
J-DS ID: J-DS002504

【関連 ID】
  JSUB: JSUB000481
  hum_id: hum0273

【申請情報】
  研究題目: ...
  PI: 山田太郎 (○○大学)
```

## EAV -> API フレンドリー変換

DB ダンプの `components` 配列は EAV (Entity-Attribute-Value) パターンで、そのままでは扱いにくい。
`transform.ts` で API フレンドリーなネスト構造に変換する。

### パイプライン

```plaintext
java-source/                        json-data/
  NbdcComponentKey.java               ds-applications.json ---+
  messages.properties                  du-applications.json --+
  messages_en.properties               component-keys.json ---+
       |                                                      |
       v [1]                                                  v [3]
  component-keys.json ---------> (referenced by) ---> *-transformed.json
```

```plaintext
[PostgreSQL] --[2]--> ds-applications.json
                      du-applications.json
```

| Step | Script | Input | Output | Timing |
|------|--------|-------|--------|--------|
| [1] | `convert-java-source.ts` | `java-source/` 3 files | `component-keys.json` | Java source update only |
| [2] | `dump-all-data.sh` | PostgreSQL | `*-applications.json` | Daily batch |
| [3] | `transform.ts` | `component-keys.json` + `*-applications.json` | `*-transformed.json` | After dump |

### 使い方

```bash
# 1. コンポーネントキー定義の生成 (初回 or Java ソース更新時のみ)
bun run scripts/convert-java-source.ts

# 2. DB ダンプ (日次バッチ)
./scripts/dump-all-data.sh

# 3. 構造変換
bun run scripts/transform.ts
# => json-data/ds-applications-transformed.json (42 records)
# => json-data/du-applications-transformed.json (102 records)
```

### java-source/ の中身

JGA 申請システムの Java ソースから抜き出した 3 ファイル。コンポーネントキーの定義元。

| ファイル | 内容 |
|---------|------|
| `NbdcComponentKey.java` | Enum 定義。全キー名と `multiValue` フラグ |
| `messages.properties` | 日本語ラベル |
| `messages_en.properties` | 英語ラベル |

### 変換前 (EAV)

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

### 変換後 (API フレンドリー)

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

主な変換ルール:

- **snake_case → camelCase**: `pi_first_name` → `pi.firstName`
- **BilingualText マージ**: `aim` + `aim_en` → `{ ja, en }`
- **multiValue グループ紐付け**: 同一キーの複数値を index でオブジェクト配列化
- **ステータスラベル付与**: ステータスコードに日英ラベルを追加
- **Boolean 変換**: `"TRUE"` / `"ok"` → `true`

詳細は [出力スキーマ定義](docs/output-schema.md) を参照。

### テスト

```bash
bun test
```

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
