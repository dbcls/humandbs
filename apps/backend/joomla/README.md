# Joomla

Joomla の MySQL ダンプから menu / misc / news ページのコンテンツを JSON として抽出する。

## 目的

HumanDBs ポータルサイトの Joomla CMS から、以下のページコンテンツを抽出する:

- **menu ページ**: トップページ、FAQ、データ利用方法など (約 18 件)
- **misc ページ**: ポリシー、古いガイドラインなど (約 66 件)
- **news 記事**: カテゴリ `cat-whats-new` の全記事 (約 630 件、ja=623 / en=7)

## クイックスタート

```bash
cd apps/backend/joomla

# 1. DB コンテナ起動 (初回は 5-10 分かかる)
docker run -d \
  --name humandbs-joomla-db \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=joomla \
  -v "$(pwd)/initdb":/docker-entrypoint-initdb.d:ro \
  -v "$(pwd)/dumps":/dumps:ro \
  -p 127.0.0.1:3306:3306 \
  mysql:5.7 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci \
  --max_allowed_packet=1G

# 2. インポート完了を待つ ("ready for connections" が出るまで)
docker logs -f humandbs-joomla-db

# 3. パス一覧を生成 (research/menu/misc に分類)
./scripts/list-paths-categorized.sh

# 4. menu ページを抽出
./scripts/export-menu-json.sh
bun run scripts/export-menu.ts

# 5. misc ページを抽出
./scripts/export-misc-json.sh
bun run scripts/export-misc.ts

# 6. news 記事を抽出 (catid 直接なので paths 不要)
./scripts/export-news-json.sh
bun run scripts/export-news.ts

# 7. 結果確認
jq '.totalCount' output/menu-pages.json  # 約 34 件 (ja/en)
jq '.totalCount' output/misc-pages.json  # 約 109 件 (ja/en)
jq '.totalCount' output/news-pages.json  # 約 630 件 (ja/en)

# 8. 後片付け
docker stop humandbs-joomla-db && docker rm humandbs-joomla-db
```

## 出力ファイル

| ファイル | git 管理 | 説明 |
|----------|---------|------|
| `output/menu-pages.json` | tracked | menu ページ (クリーニング済み) |
| `output/misc-pages.json` | tracked | misc ページ (クリーニング済み、frontend document seed 済みの slug は除外) |
| `output/news-pages.json` | tracked | news 記事 (クリーニング済み) |
| `output/*-raw.json` | **ignored** | DB 直接出力の中間ファイル (`export-*.ts` の入力用) |
| `output/paths*.txt` | tracked | list-paths-categorized.sh で生成するパス一覧 |

**最終 JSON 3 種は commit 対象** (frontend 担当者への納品物)。raw JSON は `.gitignore` で除外する。
frontend へのハンドオフ指示は `.claude/api-to-front-joomla-handoff.md` を参照。

**出力フォーマット (menu / misc):**

```typescript
interface MiscPagesOutput {
  generatedAt: string           // 生成日時
  totalCount: number            // 総ページ数
  pages: MiscPageContent[]      // ページ配列
}

interface MiscPageContent {
  path: string                  // パス (home, faq, violation など)
  lang: "ja" | "en"             // 言語
  originalUrl: string           // 元の URL
  title: string                 // 記事タイトル
  releaseDate: string | null    // 公開日 (YYYY-MM-DD)
  modifiedDate: string | null   // 更新日 (YYYY-MM-DD)
  contentHtml: string           // クリーンな HTML
  contentText: string           // プレーンテキスト (検索用)
}
```

**出力フォーマット (news):**

news は Joomla の個別記事パスを持たず旧 URL も廃止するため、`path` / `originalUrl` を持たない。
frontend の `newsItemCreateSchema` にそのまま流し込める最小フィールド構成。

```typescript
interface NewsPagesOutput {
  generatedAt: string
  totalCount: number
  pages: NewsPageContent[]
}

interface NewsPageContent {
  lang: "ja" | "en"             // catid (19=ja, 21=en) から判定
  title: string
  publishedAt: string | null    // 公開日 (YYYY-MM-DD)
  modifiedDate: string | null
  contentHtml: string           // クリーンな HTML (内部 <a> は unwrap, 外部リンクは保持)
  contentText: string           // プレーンテキスト
}
```

## 前提条件

- Docker がインストールされていること
- ダンプファイルが `dumps/` に配置されていること

### ダンプファイル

| ファイル | 環境 |
|----------|------|
| `dumps/mysqldump_humandbs.dbcls.jp.sql` | 本番 (デフォルト)
| `dumps/mysqldump_gr-sharingdbs.dbcls.jp.sql` | staging |

staging を使う場合は環境変数を設定:

```bash
export JOOMLA_DB_FILE=mysqldump_gr-sharingdbs.dbcls.jp.sql
```

## Scripts

すべてのスクリプトはコンテナ `humandbs-joomla-db` が起動している必要がある。

### パス分類

| スクリプト | 説明 | 出力 |
|------------|------|------|
| `list-paths.sh` | 全パス一覧を出力 | `output/paths.txt` |
| `list-paths-categorized.sh` | パスを3カテゴリに分類 | `output/paths-{research,menu,misc}.txt` |

**カテゴリ分類ルール:**

| カテゴリ | 分類方法 | 件数 |
|----------|----------|------|
| research | path が `hum[0-9]{4}-v[0-9]+(-release(-note)?)?` にマッチ | 約 1238 件 |
| menu | menutype が `main-menu-*` または `footer-menu-*` | 約 18 件 |
| misc | menutype が `non-linked-pages-*`、または `researches-*` で research パターンに合わないもの | 約 66 件 |

**news は `list-paths-categorized.sh` の対象外。** Joomla のカテゴリブログビューで、個別記事は
`b1i5n_menu` に登録されていないため、`b1i5n_content.catid IN (19, 21)` で直接抽出する。

**menutype について:**

| menutype | 説明 | 対応カテゴリ |
|----------|------|--------------|
| `main-menu-ja/en` | メインメニュー | menu |
| `footer-menu-ja/en` | フッターメニュー | menu |
| `researches-ja/en` | 研究ページ | research (パターンマッチ) / misc (それ以外) |
| `non-linked-pages-ja/en` | ナビに表示されないページ | misc |

### ページ抽出

| スクリプト | 説明 | 入力 | 出力 |
|------------|------|------|------|
| `export-menu-json.sh` | menu ページを DB から取得 | `paths-menu.txt` | `menu-pages-raw.json` |
| `export-menu.ts` | menu ページを HTML クリーニング | `menu-pages-raw.json` | `menu-pages.json` |
| `export-misc-json.sh` | misc ページを DB から取得 | `paths-misc.txt` | `misc-pages-raw.json` |
| `export-misc.ts` | misc ページを HTML クリーニング | `misc-pages-raw.json` | `misc-pages.json` |
| `export-news-json.sh` | news 記事を DB から取得 (catid=19, 21) | (なし) | `news-pages-raw.json` |
| `export-news.ts` | news 記事を HTML クリーニング | `news-pages-raw.json` | `news-pages.json` |

### HTML クリーニング処理

- **削除する属性**: `style`, `class`, `id`, `data-*`, `onclick` 等イベントハンドラ, `align`, `width` 等非推奨属性
- **保持する属性**: `href`, `src`, `alt`, `title`, `colspan`, `rowspan`
- **削除するタグ (コンテンツごと)**: `script`, `style`, `noscript`, `iframe`
- **unwrap するタグ (タグのみ削除)**: `span`, `font`, `center`
- **条件付き unwrap**: `<a>` のうち href が `http://` / `https://` で始まらないもの
  (Joomla 内部リンク `index.php?Itemid=...` など) はタグを剥がしてテキストのみ残す。
  外部リンクはそのまま保持する。

## その他のコマンド

### MySQL に直接接続

```bash
docker exec -it humandbs-joomla-db mysql -uroot -prootpassword joomla
```

### コンテナ停止・削除

```bash
docker stop humandbs-joomla-db && docker rm humandbs-joomla-db
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

### 注意事項

DB ダンプと本番サイトの状態が異なる場合がある。スクリプトは DB 上の公開状態を基に判定しているため、本番で 404 になるページが含まれる可能性がある。
