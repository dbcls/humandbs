# 全体像

NBDC ヒトデータベースのポータルでは、admin が研究と、研究に属するデータセットの内容を編集して公開する。ポータルは、公開した内容を公開ページ・検索・JSON API・データファイルとして読者に提供する。この文書では、どの構成要素が何を担当し、データがどの順に流れるかをまとめる。語の意味は [concepts.md](concepts.md)、個々の決まりはそれぞれの docs にある。

## 構成要素

ポータルは、1 つのアプリ、アプリの前でリクエストを受ける proxy、DB、ファイルストアからなる。アプリは、外部の 4 つのシステム (JGA 申請管理システムの DB、DDBJ Search、DDBJ の公開 FTP、Keycloak) を読み、Slack に通知を送る。

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
                                           +----> DDBJ public FTP
                                           +----> Keycloak (DDBJ)
                                           +----> Slack (optional)
```

| 構成要素 | 担当すること |
|---|---|
| `proxy` | 外部からのリクエストをすべて受ける。build した静的ファイルは `proxy` が返す。ファイルの配信 (`/files/`) のリクエストと、presigned URL でのアップロードと admin の非公開ファイルのダウンロード (`/private/`) のリクエストは、`s3` へ送る。それ以外のリクエストは `app` へ送る。すべての応答にセキュリティ用のヘッダを付ける ([deployment.md](deployment.md)) |
| `app` | 画面・JSON API・編集・公開のすべてを担当する。1 つの React Router アプリで、loader と action から Postgres を直接読み書きする。外部システムからの取得、ファイルの公開と非公開を切り替えるジョブ、Slack への通知も、`app` のプロセスで実行する |
| `db` | ファイル以外のデータをすべて保存する。下書き、公開中のバージョン、全文検索と絞り込みの索引も `db` にある |
| `s3` | ファイルストア (SeaweedFS の S3 互換の API)。データファイルと、記事の画像や PDF を保存する。ファイルが公開か非公開かは、2 つの bucket のどちらにあるかで決まる ([files.md](files.md)) |
| `assistant-api` | 申請支援アシスタント。既定では起動しない別のサービスで、`app` だけが呼ぶ ([assistant.md](assistant.md)) |
| JGA 申請管理システムの DB | 他のプロジェクトの所管。ポータルは読むだけで、書き込みも schema の変更もしない |
| DDBJ Search | ポータルは、外部 accession の日付と DRA の登録内容を DDBJ Search から読む ([upstream.md](upstream.md)) |
| DDBJ の公開 FTP | ポータルは、DRA・GEA・MetaboBank のデータセットのファイルの大きさと形式を DDBJ の公開 FTP から読む ([upstream.md](upstream.md)) |
| Keycloak | DDBJ 所管の認証。admin かどうかはポータル側で管理する ([auth.md](auth.md)) |
| Slack | アプリは、レビューのコメントと公開を Incoming Webhook で Slack に知らせる。送るだけで、Slack からは何も読まない ([publishing.md](publishing.md)) |

## データの流れ

admin は、研究の内容を下書きで編集する。admin が下書きを公開すると、アプリは下書きからバージョンと検索用の行を作る。読者は、公開した内容を公開ページ・検索・JSON API で読む。

```
draft (editing) --publish--> research version + search rows --> public pages / search / JSON API
      ^                                   ^
      |                                   |
 upstream (JGA DB, DDBJ Search, FTP) external cache (periodic)
```

1. admin が研究の下書きを書く。admin は、値をフォームに入力するか、公開済みのバージョン・他の下書き・データ提供申請の枝番から取り込む ([editing.md](editing.md))。
2. admin は、共有リンクで提供者にプレビューを見せ、提供者からコメントを受け取る。
3. admin が下書きを公開すると、アプリは下書きをバージョンにし、同じトランザクションでその研究の検索用の行を作り直す ([publishing.md](publishing.md))。
4. アプリは、公開ページ・検索・JSON API のどれでも、公開中の研究・バージョン・データセットを検索用の行からだけ読む ([data-model.md](data-model.md))。
5. アプリは、申請管理システム・DDBJ Search・DDBJ の公開 FTP の値を一定の間隔で取得し、DB にコピーする。取得する値は、制限公開データの利用者の一覧、accession の日付、データセットのファイルの大きさと形式、承認済みのデータ提供申請などである。公開ページと管理画面の処理は、DB にコピーした値を読む。外部システムが止まっていても表示し続けるためである ([upstream.md](upstream.md))。

記事・お知らせ・アラートは、研究とは別に扱う。記事・お知らせ・アラートには研究の下書きとバージョンを使わず、ポータルは本文と公開の状態だけを管理する ([site-content.md](site-content.md))。

## ディレクトリ

repo の主なディレクトリと、そのディレクトリに置くものを挙げる。型と値の一覧はコードにあり、docs にはコピーしない。詳しい内容がどこにあるかも、表に書く。

| ディレクトリ | 置くもの |
|---|---|
| `app/routes/` | route module。loader と action に書く処理は少なくし、処理の本体は `app/` のほかのディレクトリに置く。route と URL の一覧は `app/routes.ts` にある |
| `app/db/` | DB への接続、テーブルと制約 (`schema/`)、アプリが DB に接続する role の権限 |
| `app/content/` | 研究の内容とデータセットの内容の型 (`types.ts`、バージョンと下書きで共通)。研究の内容とデータセットの内容から、公開用の表示データと書式付きテキストを作る関数と、単位を換算する関数 |
| `app/admin/` | 管理画面のサーバー側の処理。下書きへの書き込みは、すべて `drafts.server.ts` の関数を通す |
| `app/public/` `app/search/` | 公開ページの読み取り、検索式、絞り込みの集計、検索用の行の作り直し |
| `app/review/` | 共有リンク、プレビュー、コメント |
| `app/files/` | ファイルストアの読み書き、ファイルの公開と非公開を切り替えるジョブ、データセットのファイルの選択 |
| `app/upstream/` | 申請管理システムの DB・DDBJ Search・DDBJ の公開 FTP の読み取りと、DB にコピーした値の更新 |
| `app/api/` | JSON API の応答の組み立て。応答の形は `schema.ts` と、`schema.ts` から作る `/api/openapi.json` にある |
| `app/auth/` | ログイン、セッション、権限 |
| `app/slack/` | Slack への通知の組み立てと送信 |
| `app/cart/` `app/icd10/` `app/assistant/` | カート、ICD10 の分類、申請支援アシスタントへの中継 |
| `app/components/` | 画面の部品。見た目の規則は、source を読んで判定するテストに書いてある ([development.md](development.md) の「画面の規則のテスト」) |
| `app/i18n/` | 画面の文言の辞書 (`messages.ts`、日本語と英語) と、表示する言語の選び方 |
| `migration/` | 旧ポータルの dump から開発用データを作って DB に入れる処理 |
| `scripts/` | `npm run` から呼ぶ CLI と、配置先を更新する script (`deploy.sh`) |
| `drizzle/` | 配置先に適用する schema の migration。`npm run db:generate` で作る ([deployment.md](deployment.md)) |
| `docker/` | nginx の設定、Postgres の初期化の SQL、SeaweedFS の設定 |
| `tests/e2e/` | 配置した環境に対して実行する Playwright のテスト |
| `assistant-api/` | 申請支援アシスタント (Python の別サービス) |

## やっていないこと

- 別の検索エンジンへのデータのコピー。アプリは全文検索も絞り込みも Postgres の検索用の行で行うので、「公開したが、まだ検索結果に表示されない」状態が起きない。
- 画面のための API 層。画面の loader と action が DB を読み、JSON API は外部の利用者のためだけにある。
- 専用のジョブ worker。時間のかかる処理 (ファイルの公開と非公開の切り替え、外部システムからの取得) は、アプリのプロセスが Postgres のジョブの行をロックして順に実行すれば足りる。
- i18n ライブラリ。言語は日本語と英語に固定で、文言を書くのは開発者だけである。画面に表示する文字の大半は、研究の内容に保存した日本語と英語の値で、i18n ライブラリで扱うものではない。
