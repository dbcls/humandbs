# 全体像

NBDC ヒトデータベースのポータルは、研究とそれに属するデータセットの記述を admin が編集して公開し、読者に公開ページ・検索・JSON API・データファイルとして提供する。この文書では、どの構成要素が何を担当し、データがどの順に流れるかをまとめる。語の意味は [concepts.md](concepts.md)、個々の決まりはそれぞれの docs にある。

## 構成要素

ポータルは 1 つのアプリと、その前に置く proxy、DB、ファイルの置き場からなり、外部のシステムを 3 つ読む。

```
            browser
               |
            proxy (nginx) ---- /files/  /private/ ----> s3 (SeaweedFS)
               |                                          ^
               +---- everything else ----> app -----------+
                                           |  (React Router, SSR)
                                           +----> db (Postgres + PGroonga)
                                           +----> assistant-api (optional)
                                           +----> JGA application DB (read-only)
                                           +----> DDBJ Search
                                           +----> Keycloak (DDBJ)
```

| 構成要素 | 担当すること |
|---|---|
| `proxy` | 外から届く唯一の入口。build した静的ファイルを返し、ファイルの配信 (`/files/`) と署名付きアップロード (`/private/`) を `s3` へ、それ以外を `app` へ送り、すべての応答にセキュリティ用のヘッダを付ける ([deployment.md](deployment.md)) |
| `app` | 画面・JSON API・編集・公開のすべて。loader と action から Postgres を直接読み書きする 1 つの React Router アプリで、外部システムからの取得とファイルの切り替えのジョブもこのプロセスで実行する |
| `db` | データの置き場はここだけである。下書きも公開中のバージョンも、全文検索と絞り込みの索引もここに置く |
| `s3` | データファイルと、記事の画像や PDF。公開かどうかは、2 つの bucket のどちらに置くかで決まる ([files.md](files.md)) |
| `assistant-api` | 申請支援アシスタント。compose の profile で起動する別のサービスで、`app` だけが呼ぶ ([assistant.md](assistant.md)) |
| JGA 申請管理システムの DB | 他のプロジェクトの所管。ポータルは読むだけで、書き込みも schema の変更もしない |
| DDBJ Search | 外部 accession の日付と、DRA の登録内容を読む |
| Keycloak | DDBJ 所管の認証。admin かどうかはポータル側で管理する ([auth.md](auth.md)) |

- 別の検索エンジンを置かない。全文検索も絞り込みも Postgres の中の検索用の行で行うので、「公開したがまだ検索に出ない」状態が起きないためである。
- 専用の worker を置かない。時間のかかる処理 (ファイルの切り替え、外部システムからの取得) は、`app` のプロセスが Postgres の行をロックして順に実行すれば足りるためである。
- 画面は JSON API を使わない。API は外部の利用者のためのもので、画面は loader から DB を読む ([public-api.md](public-api.md))。

## データの流れ

研究の記述は、下書きで編集し、公開でバージョンと検索用の行になり、そこから読者に届く。

```
draft (editing) --publish--> research version + search rows --> public pages / search / JSON API
      ^                                   ^
      |                                   |
 upstream (JGA DB, DDBJ Search)      external cache (daily)
```

1. admin が研究の下書きを書く。値はフォームに入力するか、公開済みのバージョン・他の下書き・データ提供申請の枝番から取り込む ([editing.md](editing.md))。
2. 共有リンクで提供者にプレビューを見せ、コメントを受け取る。
3. 公開すると下書きがバージョンになり、同じトランザクションでその研究の検索用の行を作り直す ([publishing.md](publishing.md))。
4. 公開ページ・一覧・JSON API は、公開中のものを検索用の行からだけ読む ([data-model.md](data-model.md))。
5. 申請管理システムと DDBJ Search の値 (利用者の一覧、accession の日付など) は、1 日 1 回取得して DB にコピーし、公開ページはそのコピーを読む。外部システムが止まっていても公開ページを表示し続けるためである。

記事・お知らせ・アラートは研究の下書きとバージョンを使わない別の流れで、本文と公開の状態だけを管理する ([site-content.md](site-content.md))。

## コードのどこに何があるか

型と値の一覧はコードにあり、docs には書き写さない。知りたいことごとに、読む場所を挙げる。

| 知りたいこと | 読む場所 |
|---|---|
| テーブルと制約 | `app/db/schema/` |
| 記述の型 (バージョン・下書き・データセットの記述) | `app/content/types.ts` |
| JSON API の応答の形 | `app/api/schema.ts` と、そこから作る `/api/openapi.json` |
| 画面の文言 (日本語と英語) | `app/i18n/messages.ts` |
| route と URL | `app/routes.ts` |
| 画面の部品と見た目の規則 | `app/components/`、`/dev/ui`、規則のテスト ([development.md](development.md)) |

## ディレクトリ

repo の主なディレクトリと、そこに置くものを挙げる。

| ディレクトリ | 置くもの |
|---|---|
| `app/routes/` | route module。loader と action は薄くし、処理は下のディレクトリに置く |
| `app/content/` | 記述の型と、そこから公開用の表示データ・文・単位の換算を作る関数 |
| `app/admin/` | 管理画面のサーバー側。下書きへの書き込みはすべて `drafts.server.ts` を通す |
| `app/public/` `app/search/` | 公開ページの読み取り、検索式、絞り込みの集計、検索用の行の作り直し |
| `app/review/` | 共有リンク、プレビュー、コメント |
| `app/files/` | ファイルの置き場、bucket を切り替えるジョブ、データセットのファイル選択 |
| `app/upstream/` | 申請管理システムの DB と DDBJ Search の読み取りと、そのコピーの更新 |
| `app/api/` | JSON API の応答の組み立て、schema、OpenAPI |
| `app/auth/` | ログイン、セッション、権限 |
| `app/cart/` `app/icd10/` `app/assistant/` | カート、ICD10 の分類、申請支援アシスタントへの中継 |
| `app/components/` | 画面の部品 |
| `app/i18n/` | 文言の辞書と、表示する言語の選び方 |
| `migration/` | 旧ポータルのデータを変換して入れる処理 (開発用データと本番の移行) |
| `scripts/` | `npm run` から呼ぶ CLI と、配置先の更新 (`deploy.sh`) |
| `drizzle/` | 配置先に適用する schema の migration。`npm run db:generate` で作る ([deployment.md](deployment.md)) |
| `docker/` | nginx、Postgres の初期化、SeaweedFS の設定 |
| `tests/e2e/` | 配置した環境に対して実行する Playwright のテスト |
| `assistant-api/` | 申請支援アシスタント (Python の別サービス) |

## やっていないこと

- 別の検索エンジンへのデータのコピー。コピーが無ければ反映を待つ時間も無く、全文検索も絞り込みも Postgres で済む。
- 画面のための API 層。loader と action が DB を読み、API は外部の利用者のためだけにある。
- 専用のジョブ worker。待つのは S3 の中のコピーと外部システムの応答だけで、アプリのプロセスで実行すれば足りる。
- i18n ライブラリ。言語は日本語と英語に固定で、文言を書くのは開発者だけである。画面の文字の大半は記述の日本語と英語の組で、ライブラリで扱うものではない。
