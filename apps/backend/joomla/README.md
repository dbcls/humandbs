# Joomla Database Tools

Joomla の MySQL ダンプを読み込んでクエリを実行するための環境。

## 前提条件

- Docker がインストールされていること
- ダンプファイルが `dumps/` に配置されていること

## ダンプファイル

| ファイル | 環境 |
|----------|------|
| `dumps/mysqldump_humandbs.dbcls.jp.sql` | 本番 |
| `dumps/mysqldump_gr-sharingdbs.dbcls.jp.sql` | staging |

## 使用方法

### 1. 環境変数でダンプファイルを指定

```bash
cd apps/backend/joomla

# 本番環境のダンプを使用（デフォルト）
export JOOMLA_DB_FILE=mysqldump_humandbs.dbcls.jp.sql

# staging を使用する場合
# export JOOMLA_DB_FILE=mysqldump_gr-sharingdbs.dbcls.jp.sql
```

### 2. コンテナ起動

```bash
docker run -d \
  --name humandbs-joomla-db \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=joomla \
  -e JOOMLA_DB_FILE="${JOOMLA_DB_FILE:-mysqldump_humandbs.dbcls.jp.sql}" \
  -v "$(pwd)/initdb":/docker-entrypoint-initdb.d:ro \
  -v "$(pwd)/dumps":/dumps:ro \
  -p 127.0.0.1:3306:3306 \
  mysql:5.7 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci \
  --max_allowed_packet=1G
```

初回はダンプのインポートに 5-10 分程度かかる。

### 3. インポート状況確認

```bash
docker logs -f humandbs-joomla-db
```

"ready for connections" が表示されたら完了。

### 4. MySQL 接続

```bash
docker exec -it humandbs-joomla-db mysql -uroot -prootpassword joomla
```

### 5. コンテナ停止・削除

```bash
docker stop humandbs-joomla-db && docker rm humandbs-joomla-db
```

## Scripts

**注意**: すべてのスクリプトはコンテナ `humandbs-joomla-db` が起動している必要がある。

### `scripts/list-paths.sh`

Joomla のメニュー構造から URL パス一覧を `output/paths.txt` に出力する。

```bash
./scripts/list-paths.sh
# Output: output/paths.txt (1322 paths)
```

### `scripts/list-paths-categorized.sh`

URL パスを3カテゴリに分類して、カテゴリごとに別ファイルへ出力する。

| カテゴリ | 出力ファイル | パターン |
|----------|--------------|----------|
| research | `output/paths-research.txt` | `hum[0-9]{4}-v[0-9]+(-release(-note)?)?` |
| service | `output/paths-service.txt` | ホワイトリスト方式 (home, faq, data-use, etc.) |
| misc | `output/paths-misc.txt` | 上記以外 |

```bash
./scripts/list-paths-categorized.sh
# Output:
#   output/paths-research.txt (1237 paths)
#   output/paths-service.txt (17 paths)
#   output/paths-misc.txt (65 paths)
```

### `scripts/export-misc-json.sh`

misc カテゴリのページコンテンツを DB から取得し、`output/misc-pages-raw.json` に出力する。

```bash
./scripts/export-misc-json.sh
# Output: output/misc-pages-raw.json
```

### `scripts/export-misc.ts`

`misc-pages-raw.json` を読み込み、HTML をクリーニングして `output/misc-pages.json` に出力する。

```bash
bun run scripts/export-misc.ts
# Output: output/misc-pages.json
```

**HTML クリーニング処理:**
- 削除する属性: `style`, `class`, `id`, `data-*`, `onclick` 等イベントハンドラ, `align`, `width` 等非推奨属性
- 保持する属性: `href`, `src`, `alt`, `title`, `colspan`, `rowspan`
- 削除するタグ（コンテンツごと）: `script`, `style`, `noscript`, `iframe`
- unwrap するタグ（タグのみ削除）: `span`, `font`, `center`

**出力フォーマット:**

```typescript
interface MiscPagesOutput {
  generatedAt: string           // 生成日時
  totalCount: number            // 総ページ数
  pages: MiscPageContent[]      // ページ配列
}

interface MiscPageContent {
  path: string                  // パス (violation, contact-us など)
  lang: "ja" | "en"             // 言語
  originalUrl: string           // 元の URL
  title: string                 // 記事タイトル
  releaseDate: string | null    // 公開日 (YYYY-MM-DD)
  modifiedDate: string | null   // 更新日 (YYYY-MM-DD)
  contentHtml: string           // クリーンな HTML
  contentText: string           // プレーンテキスト（検索用）
}
```

## Database Structure

Joomla の URL と記事の対応は以下のテーブルで管理される。

### 主要テーブル

| テーブル | 説明 |
|----------|------|
| `b1i5n_menu` | メニュー構造。URL パス (`path`) とコンテンツ (`link`) の対応 |
| `b1i5n_content` | 記事本体。タイトル、本文、公開状態 |
| `b1i5n_categories` | カテゴリ。記事の分類 |

### URL 解決の仕組み

1. ブラウザが `/hum0001-v1` にアクセス
2. `b1i5n_menu.path = 'hum0001-v1'` のレコードを検索
3. `link` カラムから記事 ID を取得 (`index.php?option=com_content&view=article&id=XXX`)
4. `b1i5n_content.id = XXX` の記事を表示

### 公開状態に影響するカラム

| テーブル | カラム | 値 |
|----------|--------|-----|
| `b1i5n_menu` | `published` | 1=公開, 0=非公開 |
| `b1i5n_content` | `state` | 1=公開, 0=非公開, -2=ゴミ箱 |
| `b1i5n_categories` | `published` | 1=公開, 0=非公開 |
| 各テーブル | `access` | 1=Public, 2=Registered, etc. |

### メニュータイプ (`menutype`)

| タイプ | 説明 |
|--------|------|
| `main-menu-ja/en` | メインメニュー |
| `researches-ja/en` | 研究ページ |
| `non-linked-pages-ja/en` | ナビゲーションに表示されないページ |
| `footer-menu-ja/en` | フッターメニュー |

### 注意事項

DB ダンプと本番サイトの状態が異なる場合がある。スクリプトは DB 上の公開状態を基に判定しているため、本番で 404 になるページが含まれる可能性がある。
