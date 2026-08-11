# 開発環境

依存サービスも含めて compose で立てる。**開発コマンドはすべて container の中で実行する** —
ホストの Node で `npm` を直接叩くと、container 内の `node_modules` (named volume) とホストの状態が
食い違う。

## 前提

Docker と Docker Compose だけ。Node もホストには要らない。

## 触ってはいけないもの

- **production 環境。** 検証は staging で行う。ここからのコピーは読み取りだけで、書き戻す経路を作らない
- **JGA 申請管理システムの DB (jga-shinsei)。** 他プロジェクトの所管なので、schema の変更も直接の
  書き込みもしない。ポータルはキャッシュを持つ読み手にとどまる ([data-model.md](data-model.md))。
  **この DB だけは staging に実データが無い**ので読むのは production だが、接続は read-only に固定する

## 書くときの約束

- **仕様が絡む変更は `docs/` を先に直してから実装する。** 索引は [README.md](../README.md)
- **型の SSOT はコードの側。** schema は `app/db/schema/`、content の型は `app/content/types.ts`、
  API の応答は `app/api/schema.ts`。doc に一覧を写さない
- **作業経緯を成果物に持ち込まない。** コードのコメント・test 名・docs・commit message に
  「以前は X だった」「phase 1 より」の類を書かない。コードベースは現在の意図だけを語り、経緯は
  git log と PR に残る

## 初回セットアップ

```bash
cp .env.example .env
docker compose run --rm --no-deps app npm install
docker compose up -d
docker compose exec app npm run db:push
docker compose exec app npm run s3:buckets
```

`http://localhost:8080/` が開けば起動している。`/healthz` は依存サービスの疎通を返し、1 つでも
落ちていれば 503 になる。

`npm install` を先に走らせるのは、`node_modules` が named volume にあり image に焼かれていないため。
`docker compose down -v` で volume を消したら install からやり直す。**`db:push` を初回に打つ必要があるのは、
アプリが繋ぐ role をそれが作るから** (「[DB を触る](#db-を触る)」)。**`s3:buckets` が要るのは、bucket を
書き込みの副作用で作らないから** — どちらの bucket に居るかがファイルの公開状態そのものなので、
最初の書き込みで bucket が生まれる形にすると公開が操作の順序に依存する
([data-model.md](data-model.md) の「ファイル」)。

## サービス

| service | 中身 | ホストからの見え方 |
|---|---|---|
| `proxy` | nginx。`/files/` と `/private/` を `s3` に、それ以外を `app` に渡す | `8080` |
| `app` | React Router の dev サーバー | proxy 経由のみ |
| `db` | Postgres + PGroonga | `127.0.0.1:5432` |
| `s3` | SeaweedFS (master / volume / filer / S3 API) | 公開しない |

**proxy を通すのは本番の経路をそのまま再現するため。** ファイル配信の `X-Content-Type-Options` と
`Content-Disposition` は proxy が付けるので、S3 API を直接叩ける口があるとその header を迂回した
URL が同じ object に生まれる。filer の HTTP は完全に無認証で非公開 bucket の中身まで返すので、
こちらも同じ理由で閉じている (詳細は [data-model.md](data-model.md) の「ファイル」)。

**upload も proxy を通る。** presigned URL の署名は Host を含むので、ブラウザに渡す URL は
`HUMANDBS_AUTH_REDIRECT_URI` から導いたこのサイトの origin で作られ、`/private/` を proxy が store へ
渡す。署名の無い要求は store が 403 で落とすので、この経路から非公開 bucket が読めるようにはならない。

proxy が 8080 で受けるのは、認証に使う DDBJ Keycloak (staging) に
`http://localhost:8080/auth/callback` が redirect URI として登録済みだから。8080 を他プロセスが
使っているときは `HUMANDBS_PUBLIC_PORT` を変えられるが、その場合サインインは通らない。

**このアプリが読む環境変数には `HUMANDBS_` を付ける。** prefix が無いのは、外部のソフトウェアが名前を
決めているもの (`TZ`、`NODE_ENV`、db container に渡す `POSTGRES_*`) だけで、それらの値も `.env` 側では
prefix 付きの変数から渡す。

## 日常のコマンド

```bash
docker compose exec app npm run lint        # eslint
docker compose exec app npm test            # vitest (全階層)
docker compose exec app npm run test:unit   # 不変量 + 単体 (DB 不要)
docker compose exec app npm run test:db     # schema + 経路 (db が要る)
docker compose exec app npm run typecheck   # react-router typegen && tsc
docker compose exec app npm run build       # 本番ビルド
docker compose exec app npm run db:push     # schema 定義を DB に反映し、権限を張り直す
docker compose exec app npm run s3:buckets  # 2 つの bucket を作る (無ければ)
docker compose exec app npm run admin:list  # admin の一覧
docker compose exec app npm run upstream:refresh  # 上流のキャッシュを取り直す
```

`app` が起動していないときは `docker compose run --rm --no-deps app <command>` で単発実行する。ただし
**`npm test` と `test:db` は `db` を使う** — schema の不変条件を実際の Postgres に対して確かめるので、
`--no-deps` を付けると落ちる。`test:unit` は依存を持たない。階層の分け方と何を test にするかは
[testing.md](testing.md)。

## DB を触る

```bash
docker compose exec db psql -U humandbs -d humandbs
```

**role は 2 つある。** `humandbs` が schema を持ち、`humandbs_app` がアプリと test の繋ぐ先。分けるのは
event を append-only にするためで (詳細は [publishing.md](publishing.md) の「証跡」)、その帰結として
**`humandbs_app` はどのテーブルも TRUNCATE できない**。DB を空にする経路は owner に閉じている。psql は
owner で入るので、上のコマンドには制限がかからない。

`humandbs_app` を作り権限を張るのは `npm run db:grants` で、**`db:push` が後ろに繋いで自動で走る**。
role の定義は `HUMANDBS_DATABASE_URL` そのもの — 接続文字列から role 名とパスワードを読むので、
アプリが繋ぐ先と作られる role がずれない。

PGroonga は初回の initdb で入る (`docker/db/initdb/`)。入っているかは
`SELECT extname, extversion FROM pg_extension` で見る。initdb は volume が空のときにしか走らないので、
拡張や初期 SQL を足したら `docker compose down -v` からやり直す。

schema を DB に入れるのは `npm run db:push`。**migration file を持たない**ので、定義を変えたら push し
直して開発用データを作り直す。全文検索の生成列と PGroonga の index も schema 定義に含まれるので、
別途 SQL を流す手順は無い。

**列や制約を消す変更は `db:push` が対話で確認を求め、TTY が無いので落ちる。** そのときは schema ごと
作り直す。

```bash
docker compose exec db psql -U humandbs -d humandbs \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE EXTENSION pgroonga;"
docker compose exec app npm run db:push
docker compose exec app npm run db:load-dev-data
```

schema を落とすと `db:grants` が張った権限も消えるが、`db:push` が張り直す。role 自体は schema の外に
あるので残る。

**PGroonga の index は `pg_relation_size` に出ない。** 実体が Groonga 側の別ファイル
(`base/{dboid}/pgrn.*`) にあるため。このファイルは投入のたびに増え、`DROP INDEX` でも `REINDEX` でも
縮まない。しかも疎ファイルなので `ls -l` と `du -sb` は実使用の数倍を表示する (実ブロックを見るなら
`du -s --block-size=1` か `find -printf %b`)。開発中に膨らんだら volume ごと作り直すのが早い。

**crash した後は index を作り直す。** 壊れたかどうかは、heap の走査 (`LIKE`) と index 経由 (`&@~`) で
同じ条件を数えて突き合わせれば分かる。index が無い状態でも `&@~` は seq scan で正しい結果を返すので、
作り直すまでの間も検索は動く (この規模で 100 倍ほど遅くなる)。`pg_dump` / `pg_restore` は index の定義を
そのまま運ぶので、PGroonga のために足す手順は無い。

## 開発用データを入れる

入力は 3 つ。v1 の Elasticsearch dump から research 系を、v1 の CMS データベースからサイトコンテンツを、
JGA 申請管理システム由来の TSV 2 本から上流のキャッシュを読み込む。**画面を書くための実データを用意
するのが目的で、値の正しさも網羅性も問わない。**

```bash
cp <v1 repo>/.claude/joomla-es/data/es/prod/{research,research-version,dataset}.json migration/input/
scp <cron のホスト>:~/jga-relation/jga_{study,dataset}_hum_id.tsv migration/input/
docker compose exec app npm run db:load-dev-data
```

サイトコンテンツの入力 `migration/input/cms.json` は staging の CMS DB から取る。**production には
接続しない。** SQL は `.claude/` 側に置いてあり、`document` / `news_item` / `alert` とそれぞれの翻訳を
1 つの JSON オブジェクトにまとめたものを読む。

TSV 2 本は hum ラベル ↔ JGA accession の対応で、いま日次の cron が作って DDBJ Search へ送っているのと
同じもの。外部 accession の日付は v1 の dump が持つ初出日から作る。**本番ではこの 3 つを上流のバッチが
更新する**が (下の「上流のキャッシュを更新する」)、申請管理システム DB へは手元から届かないので、開発では
ファイルと dump を出発点にする。公開ゲートの検算と、DDBJ Search へ供給する endpoint
([public-api.md](public-api.md))、公開表現の日付 ([data-model.md](data-model.md) の「外部キャッシュ」)
がこれを読む。

`migration/input/` は git 管理外。10 秒ほどで終わり、**全部を 1 つのトランザクションで置き換える**ので、
途中で落ちても前のデータが残る。**test は開発用 DB を空にする**ので、test の後は入れ直す。

意図的にやっていないことがある。どれも機械的な変換ではなく判断が要るもので、本番のデータを作る移行の
側で決める。

- 共有された experiment ブロックを dataset ごとに割ること
- `rawHtml` にしか残っていない markup の回収
- 自由文に残ったリンクを型付きの値へ移すことと、上付き・下付きを Unicode に置き換えること
  (文の markdown は木にするが、畳み方の判断はしない)
- catalog のキーへの語彙型・数値型の割り当て (公開区分だけ語彙にしてある)
- dataset のファイル選択の初期値
- サイトコンテンツの去就の判断 — 中身が古い document、到達できない document、ガイドラインの版番号と
  本文の `Ver.` のずれ、失われる見出しアンカー

サイトコンテンツについては変換だけは本番と同じものを通す。**本文の生 HTML はここで markdown になる**
(`migration/html.ts`) ので、開発用データにも生 HTML は 1 つも残らない。表は GFM の表になり、`rowspan` は
セルを複製して畳む。**扱えない記法に出会ったら投入を止める** — 黙って本文に残すと、描画の時点で消える。

schema を変えたら `npm run db:push` の後にもう一度流す。

## サインインを試す

認証は DDBJ が所管する staging の Keycloak を使う。dev に Keycloak を立てないので、手元で要る設定は
`.env` の 3 行だけ。client (`humandbs-dev`) 側には `http://localhost:8080/auth/callback` が redirect URI
として登録済みで、public client + PKCE なので secret は無い。

| 変数 | dev の値 |
|---|---|
| `HUMANDBS_AUTH_ISSUER_URL` | `https://idp-staging.ddbj.nig.ac.jp/realms/master` |
| `HUMANDBS_AUTH_CLIENT_ID` | `humandbs-dev` |
| `HUMANDBS_AUTH_REDIRECT_URI` | `http://localhost:8080/auth/callback` |

**cookie に `Secure` を付けるかは redirect URI の scheme から決まる。** そのための設定を別に持たない —
本番で付け忘れる余地を作らないため。したがって http で配信している手元では `Secure` が付かない。

初めて admin になるには自分の `sub` が要る。

```bash
# 1. ヘッダの「ログイン」からサインインし、/admin を開く。自分の sub が出る
# 2. その sub を渡す
docker compose exec app npm run admin:grant -- <sub> "表示名"
# 3. /admin を開き直すと capability の一覧が出る
```

外すのは `admin:revoke -- <sub>`。**開発用データの投入は admin も session も消さない**ので
`db:load-dev-data` を流し直しても入り直さなくてよいが、**test は DB を空にするので admin は消える**。

サインアウトは Keycloak 側のセッションも終わらせるので、押した後は DDBJ アカウントのログインから
やり直しになる。

## 上流のキャッシュを更新する

アプリのプロセスが日次で回す。同じものを手からも叩ける。

```bash
docker compose exec app npm run upstream:refresh
docker compose exec app npm run upstream:refresh -- --source=archive-date
```

取得元は 4 つで、独立に失敗する — `cau` / `hum-accession` / `jgad-date` (申請管理システム DB) と
`archive-date` (DDBJ Search)。**成功したものだけが書き換わり、失敗した取得元は前回の値をそのまま
残す** ([data-model.md](data-model.md) の「外部キャッシュ」)。結果は `/admin` に出る
([editing.md](editing.md))。**CLI は「まだ期限が来ていない」で何もしないことはしない** — 手で叩く人は
いま実行したいので、期限と排他はプロセスのループだけが見る。

| 変数 | 中身 |
|---|---|
| `HUMANDBS_JGA_DATABASE_URL` | 申請管理システム DB への接続。**空なら `cau` / `hum-accession` / `jgad-date` を skip する** |
| `HUMANDBS_JGA_DB_SCHEMA` | schema 名。既定は `jgasys` |

`archive-date` は認証が要らないので手元でも回る。

**申請管理システム DB には手元から直接届かない。** 踏み台の内側からしか見えないので、試すときは tunnel を
1 本掘って container から見える宛先に向ける。`extra_hosts` で `host.docker.internal` を通してあるので、
ホスト側で docker のブリッジに bind すれば container から引ける。

```bash
ssh -f -N -L 172.17.0.1:15432:<申請管理システム DB のホスト>:5432 <踏み台>
# .env
HUMANDBS_JGA_DATABASE_URL=postgres://<user>:<password>@host.docker.internal:15432/jgadb
```

**接続は read-only を強制する** (`default_transaction_read_only`)。他プロジェクトの所管なので、設定の
間違いで書き込みが通る余地を残さない。**staging は使えない** — hum が 3 件しか無く、検証にならない。

## ファイルストアを触る

bucket は自動では作られない。

```bash
docker compose exec s3 sh -c 'echo "s3.bucket.create -name files" | weed shell -master=127.0.0.1:9333'
docker compose exec s3 sh -c 'echo "s3.bucket.list"              | weed shell -master=127.0.0.1:9333'
```

`files` が公開 bucket、非公開側は `private`。anonymous に読ませる grant は `docker/s3/s3.json` の
identity で与えていて、**prefix 単位の grant は効かないので bucket を分ける以外に公開と非公開を
表現する手段がない**。s3.json は hot-reload されないので、変えたら `docker compose restart s3`。

配信の確認は proxy 経由で行う。

```bash
curl -D - -o /dev/null http://localhost:8080/files/hum0009/example.zip
```

`X-Content-Type-Options: nosniff` が付き、画像と PDF 以外に `Content-Disposition: attachment` が
付いていれば正しい。

## 作り直す

```bash
docker compose down -v          # volume ごと消す (DB・S3・node_modules)
docker compose build --no-cache app
```

schema が固まるまで migration file を持たないので、schema を変えたら DB を作り直し、開発用データを
入れ直す。

## 意図的にやっていないこと

- **Keycloak を dev に立てない。** DDBJ が所管する staging の realm を使う
- **Keycloak から `sub` を取る script を持たない。** サインインして `/admin` を開けば出る
- **`db` 以外の port をホストに出さない。** S3 と filer を直接叩ける口を作らない
- **フォーマッタを別に入れない。** 整形は eslint (`@stylistic`) が持つので、`npm run lint:fix` で直す
- **i18n ライブラリを入れない。** UI 文言の辞書は `app/i18n/messages.ts` に TS の値として持つ。言語は
  ja / en の 2 つに固定で、書くのは開発者だけ。しかも画面に出る文字列の大半は UI 文言ではなく content の
  翻訳対で、そちらはどの i18n ライブラリの管轄でもない
- **ホストでの実行を前提にした script を置かない**
- **上流のキャッシュを画面から取り直せるようにしない。** 走らせるのはプロセスのループと CLI で、
  管理画面は結果を出すだけ
