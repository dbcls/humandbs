# 全体像

NBDC ヒトデータベースのポータルは、研究 (research) とそれに属するデータセット (dataset) の記述を
admin が編集・公開し、読者に公開ページ・公開検索・JSON API・データファイルとして届ける。この doc は
どの部品が何を受け持ち、データがどの順に流れるかを言う。個々の規則はそれぞれの doc にある。

## 部品

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

| 部品 | 受け持つもの |
|---|---|
| `proxy` | 外から届く唯一の口。build の静的ファイルを自分で返し、ファイルの配信 (`/files/`) と署名付き upload (`/private/`) を store へ、残りを `app` へ渡し、すべての応答に安全のための header を付ける ([deployment.md](deployment.md)) |
| `app` | 画面・JSON API・編集・公開のすべて。loader / action から Postgres を直接読み書きする単一の React Router アプリで、日次の上流取得とファイルの切り替えの job もこのプロセスが回す |
| `db` | 唯一の store。編集中のものも公開済みのものも、全文検索と facet の索引もここにある |
| `s3` | データファイルと記事の画像・PDF。公開かどうかは 2 つの bucket のどちらに居るかで表す ([files.md](files.md)) |
| `assistant-api` | 申請支援アシスタント。profile の後ろにいる別サービスで、`app` とだけ同じ network に居て、`app` の proxy だけが呼ぶ ([assistant.md](assistant.md)) |
| JGA 申請管理システム DB | 他プロジェクトの所管。ポータルは read-only で読み、書き込みも schema の変更もしない |
| DDBJ Search | 外部アーカイブの accession の日付と、DRA の登録内容を読む先 |
| Keycloak | DDBJ 所管の認証。admin かどうかはポータル側が持つ ([auth.md](auth.md)) |

**別の検索エンジンを置かない。** 全文検索も facet も Postgres の中の検索用の行で答えるので、
「公開したがまだ検索に出ていない」という状態が存在しない。**専用の worker も置かない** — 待ちの長い
処理 (ファイルの切り替え・上流の取得) は `app` のプロセスが Postgres の行を claim して回す。

**画面は JSON API を使わない。** API は再利用者のための出口で、画面は loader から DB を読む
([public-api.md](public-api.md))。

## データの流れ

```
draft (editing) --publish--> research version + search rows --> public pages / search / JSON API
      ^                                   ^
      |                                   |
 upstream (JGA DB, DDBJ Search)      external cache (daily)
```

1. admin は research の下書き (draft) を書く。値は手で打つか、公開版・他の下書き・申請管理システムの
   枝番から取り込む ([editing.md](editing.md))
2. 共有リンクで提供者に preview を見せ、コメントを受ける
3. 公開は下書きを版 (version) にし、同じトランザクションでその research の検索用の行を作り直す
   ([publishing.md](publishing.md))
4. 公開ページ・一覧・JSON API は検索用の行からしか公開集合を引かない ([data-model.md](data-model.md))

記事・お知らせ・アラートは版も下書きも持たない別の流れで、本文と公開状態だけを持つ
([site-content.md](site-content.md))。

## 何がどこに書いてあるか

型と値の一覧はコードが持つ。docs はそれを写さない。

| 知りたいこと | 在処 |
|---|---|
| テーブルと制約 | `app/db/schema/` |
| content の型 (版・下書き・データセットの記述) | `app/content/types.ts` |
| JSON API の応答の形 | `app/api/schema.ts` と、そこから出る `/api/openapi.json` |
| 画面の文言 | `app/i18n/messages.ts`。ドメインの語の訳は [glossary.md](glossary.md) が先 |
| route とアドレス | `app/routes.ts` |
| 画面の部品と見た目の規則 | `app/components/` と `/dev/ui`、規則 test ([development.md](development.md) の「画面の規則」) |

## ディレクトリ

| dir | 受け持つもの |
|---|---|
| `app/routes/` | route module。loader / action は薄く、中身は下の dir に置く |
| `app/content/` | content の型と、そこから公開表現・文の木・単位換算を作る純関数 |
| `app/admin/` | 管理画面の server 側。下書きへの書き込みは `drafts.server.ts` 1 つに閉じる |
| `app/public/` `app/search/` | 公開ページの読み取り、検索式、facet の集計、検索用の行の作り直し |
| `app/review/` | 共有リンク・preview・コメント |
| `app/files/` | ファイルストア、bucket の切り替えの job、ファイル選択 |
| `app/upstream/` | 申請管理システム DB と DDBJ Search の読み取り、外部キャッシュの更新 |
| `app/api/` | JSON API の投影・schema・OpenAPI |
| `app/auth/` | サインイン、セッション、capability |
| `app/components/` | 画面の部品 |
| `app/i18n/` | 文言の辞書と言語の選び方 |
| `migration/` | 旧ポータルのデータを v2 の形に直して入れる (開発用データと本番用の移行) |
| `scripts/` | `npm run` から呼ぶ CLI と、配信先の更新 (`deploy.sh`) |
| `drizzle/` | 配信先に当てる schema の migration。`npm run db:generate` が書き出す ([deployment.md](deployment.md)) |
| `docker/` | nginx・Postgres の初期化・SeaweedFS の設定 |
| `tests/e2e/` | 配置した実物に対して回す Playwright |
| `assistant-api/` | 申請支援アシスタント (Python の別サービス) |

## 意図的に持たないもの

| 持たないもの | 理由 |
|---|---|
| 別の検索エンジンへの投影 | 投影が無ければ反映待ちも無い。全文検索も facet も Postgres で完結する |
| 画面のための API 層 | loader / action が DB を読む。API は外の利用者のためだけにある |
| 専用の job worker | 待つのは S3 の中のコピーと上流の応答で、アプリのプロセスが claim して回せば足りる |
| i18n ライブラリ | 言語は ja / en に固定で、文言を書くのは開発者だけ。画面の文字の大半は content の翻訳対で、どのライブラリの管轄でもない |
