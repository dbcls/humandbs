# 開発環境

手元でポータルを動かし、変更を確かめる手順をまとめる。部品の構成は [overview.md](overview.md)、テストの方針は [testing.md](testing.md)、本番と staging への配置は [deployment.md](deployment.md) にある。

要るのは Docker と Docker Compose だけである。開発コマンドはすべて container の中で打つ。`node_modules` は named volume に置いているので、ホストで `npm` を実行すると container の中と状態が食い違うためである。守ることは次のとおり。

- production 環境を直接変更しない。検証は staging で行い、production からコピーしたデータは読むだけにする。
- JGA 申請管理システムの DB は他プロジェクトの所管である。schema の変更も書き込みもせず、接続は read-only に強制する。staging には実データが無いので、読む先は production である。
- 仕様が絡む変更は `docs/` を先に直す。型と値の一覧はコードを見れば分かるので、docs に写さない。
- 作業の経緯を成果物に持ち込まない。コメント・テスト名・docs・commit message には現在の意図だけを書く。
- route を変えたら `npm run build` も通す。route module の `loader` / `action` / `middleware` / `headers` 以外が `.server` の module に依存すると、画面の中の遷移でだけ 500 になる。SSR・lint・typecheck・テストは通ってしまい、見つけられるのは build だけである。

## 初回

1 回だけ打つ手順である。

```bash
cp env.dev .env                                          # 開発用の設定の雛形をコピーする
docker compose run --rm --no-deps app npm install        # 依存を volume に入れる
docker compose up -d                                     # db・s3・app・proxy を起動する
docker compose exec app npm run db:migrate:dev           # schema を当て、アプリの role とテスト用の database も作る
docker compose exec app npm run s3:buckets               # 2 つの bucket を作る
docker compose exec app npm run icd10:import             # ICD10 の配布物を取得して DB に入れる
```

- `http://localhost:8080/` が開けば起動している。`/healthz` は依存サービスに届くかを確かめる URL で、1 つでも届かなければ 503 を返す。
- `.env` の `COMPOSE_FILE` の行が開発用の定義を読み込む。`compose.yml` は配置用の定義で、`compose.dev.yml` を重ねて初めて source の bind mount と dev サーバーになる。この行が無いと、`docker compose` は本番用の image を build して起動する。`env.dev` より前に作った `.env` には `COMPOSE_FILE=compose.yml:compose.dev.yml` を 1 行足す。
- bucket を `s3:buckets` で先に作るのは、書き込みのついでに bucket を作らないためである。ファイルがどちらの bucket にあるかで公開か非公開かが決まるので、bucket は意図して作る。
- ICD10 の配布物は repo に置かず、`icd10:import` がその都度取得する。
- proxy が 8080 番で待ち受けるのは、Keycloak (DDBJ の staging) に `http://localhost:8080/auth/callback` が登録されているためである。`HUMANDBS_PUBLIC_PORT` を変えるとログインできなくなる。アプリが読む環境変数は `HUMANDBS_` で始まる。

### 作り直す

volume ごと消して最初からやり直す手順である。消したあとは、初回の手順を最初から打つ。

```bash
docker compose down -v                 # DB・S3・node_modules の volume ごと消す
docker compose build --no-cache app    # app の image を作り直す
```

## 日常のコマンド

変更を確かめるときに打つコマンドである。

```bash
docker compose exec app npm run lint          # eslint (@stylistic) で整形も検査する。直すのは npm run lint:fix
docker compose exec app npm run typecheck     # 型を検査する
docker compose exec app npm run test:unit     # DB を使わないテストを回す
docker compose exec app npm run test:db       # DB を使うテストを回す
docker compose exec app npm test              # 両方を回す
docker compose exec app npm run build         # 本番用に build する
```

- `app` が止まっているときは `docker compose run --rm --no-deps app <command>` で 1 回だけ実行できる。ただし `test:db` は `db` を使うので `--no-deps` を付けない。
- `test:db` を 2 つ同時に走らせない。理由は [testing.md](testing.md) の「テスト同士の独立」にある。

## DB と schema の変更

開発用の DB への入り方と、schema を変える手順である。

```bash
docker compose exec db psql -U humandbs -d humandbs         # 開発用の database に owner で入る。テスト用は -d humandbs_test
```

- role は 2 つある。`humandbs` は schema の owner で、`humandbs_app` はアプリとテストが接続する role である。`humandbs_app` は操作の記録を書き換えられず、どの表も TRUNCATE できない ([publishing.md](publishing.md) の「操作の記録」)。psql は owner で入る。
- database も 2 つある。開発用と、名前に `_test` を付けたテスト用である。テストが空にするのはテスト用だけである。

### schema を変える手順

schema を変える方法は、開発でも配置先でも 1 つだけである。定義 (`app/db/schema/`) を書き、`drizzle/` に SQL を書き出し、その SQL を当てる。全文検索の生成列と PGroonga の索引も定義に含まれる。

```bash
docker compose exec app npm run db:generate      # 定義と drizzle/ の差を SQL にして drizzle/ に書き出す
docker compose exec app npm run db:migrate:dev   # 書き出し忘れが無いか確かめてから、開発用とテスト用の両方に当てる
```

- `db:migrate:dev` は当てたあとに role と権限も設定し直す。配置先への当て方は [deployment.md](deployment.md) の「schema を変える」にある。
- `drizzle-kit push` は使わない。複数列の unique 制約・複合主キー・PGroonga の索引を、変わっていなくても毎回作り直そうとするためである。行があると対話の確認で止まり、TTY が無いと何も反映しないまま終了コード 0 で終わる。
- 定義を変えて SQL を書き出し忘れるとテストが落ちる。`app/db/schema-drift.test.ts` が `drizzle/` のコピーに書き出してみて、新しいファイルができないことを確かめる (`npm run db:check` も同じ検査をする)。drizzle-kit は失敗しても終了コード 0 を返すので、書き出しの結果は出力の文で判定している。
- 書き出した SQL は読んでから commit する。手で直してもよい。まだ配置先に出していない migration は、消して書き出し直せば 1 本にまとまる。当てた DB があれば、その分を先に戻す。
- テスト用の database は、migration を当てた記録が無ければ作り直す。テストが毎回空にするので、残すものが無いためである。
- PGroonga の拡張は、volume が空のときの初期化で `docker/db/initdb/` の SQL が入れる。この SQL を変えたら `docker compose down -v` からやり直す。
- PGroonga の索引の実体は Groonga のファイルで、`pg_relation_size` に出ず、`DROP INDEX` でも小さくならない。大きくなりすぎたら volume ごと作り直す。DB が異常終了したあとは索引を作り直す。

開発用データを入れ直すときは、schema も空から当て直せる。

```bash
docker compose exec db psql -U humandbs -d humandbs \
  -c "DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public; CREATE EXTENSION pgroonga;"
docker compose exec app npm run db:migrate:dev     # schema を空から当てる
docker compose exec app npm run db:load-dev-data   # 開発用データを入れ直す
```

## 開発用データ

画面を作るための実データを入れる手順である。値の正しさも網羅性も問わない。本番のデータは [deployment.md](deployment.md) の「データを入れる」の移行で作る。入力は `migration/input/` (git 管理外) に置く。

| 入力 | 中身 |
|---|---|
| `research.json` `research-version.json` `dataset.json` | 旧ポータルの検索基盤の dump |
| `cms.json` | 旧ポータルの CMS (staging) の記事・お知らせ・アラート。production には接続しない |
| `jga_study_hum_id.tsv` `jga_dataset_hum_id.tsv` `jga_dataset_study.tsv` | 研究 ID と JGA の accession の対応、JGAD と JGAS の対応。3 つとも無いと失敗する |
| `alert-translations.json` | 表示中のアラートのうち、片方の言語しか無いものの訳 |

```bash
docker compose exec app npm run icd10:import       # ICD10 を先に入れる。無いと移行が止まる
docker compose exec app npm run db:load-dev-data   # 開発用データを入れる
docker compose exec app npm run s3:common-assets   # 記事が参照する画像と PDF を運ぶ
docker compose exec app npm run db:seed-review     # レビュー中の下書きの例を足す (任意)
```

- `db:load-dev-data` は全部を 1 つのトランザクションで置き換えるので、途中で失敗しても前のデータが残る。admin とセッションは消さない。schema を変えたら `db:migrate:dev` のあとに流し直す。
- 記事・お知らせ・アラートの本文は本番と同じ変換を通る。旧ポータルの HTML は markdown に変換され、扱えない記法があると止まる。
- `s3:common-assets` は、本文が参照しているファイルだけを旧ポータル (`HUMANDBS_LEGACY_ORIGIN`) から運ぶ。取得したファイルは `migration/input/public-files/` に残るので、2 回目からは外部に取りに行かない。
- `db:seed-review` は、コメント・バッジ・未確定の欄を含む共有中の下書きなどを足す。何度流しても結果は同じである。`db:load-dev-data` を流し直したら打ち直す。
- 外部 accession の日付は dump の初出日から作る。JGAD の日付は申請管理システムから取れないので入らない。

## ログイン

手元でログインして admin になる手順である。`.env` の `HUMANDBS_AUTH_*` の 3 行は `env.dev` の値のまま使う。DDBJ の staging の Keycloak の public client で、PKCE を使うので secret は無い。http で開く手元では cookie に `Secure` が付かない。

ヘッダからログインして `/admin` を開くと自分の sub が表示されるので、それを admin にしてから `/admin` を開き直す。

```bash
docker compose exec app npm run admin:grant -- <sub> "表示名"   # admin にする
docker compose exec app npm run admin:revoke -- <sub>           # admin から外す
docker compose exec app npm run admin:list                      # admin の一覧を出す
```

## 外部サービス

外部から取ってきたデータ、ファイルストア、アシスタントを手元で確かめる手順である。

### 外部から取ってきたデータ

外部から取ってきたデータのキャッシュは、アプリのプロセスが毎日取り直す。手で実行することもでき、そのときは期限を見ずに取り直す。

```bash
docker compose exec app npm run upstream:refresh                           # すべての取得元から取り直す
docker compose exec app npm run upstream:refresh -- --source=archive-date  # DDBJ Search の公開日だけを取り直す
```

`archive-date` (DDBJ Search) は手元でも動く。残る 3 つは申請管理システムの DB を読み、`HUMANDBS_JGA_DATABASE_URL` が空なら skip する。その DB は踏み台の内側からしか接続できないので、手元では空のままにする。結果は `/admin` に表示される。

### 申請管理システムの代わりの schema

申請から下書きを作る画面を手元で見るには、開発用の DB に申請管理システムの代わりの schema (`jgasys`) を作る。この schema は production の複製ではない。DDL は production の列定義から機械的に作ったもので、材料は repo の外にある (場所は script の冒頭)。手元で通った SQL が production で通るとは限らない。

1. `scripts/seed-jga-dev.sh` をホストで実行する。`db` が起動している必要がある。
2. `.env` の `HUMANDBS_JGA_DATABASE_URL` を `HUMANDBS_DATABASE_URL` と同じ値にし、`HUMANDBS_JGA_DB_SCHEMA` を `jgasys` にする。
3. `docker compose up -d --force-recreate app` で `.env` を読み直させる。`restart` では読み直さない。

### ファイルストア

`files` が公開 bucket、`private` が非公開 bucket である。anonymous に読ませる設定は `docker/s3/s3.json.template` にあり、鍵は起動時に `.env` から埋める。鍵を変えたら `docker compose up -d s3` で作り直す。配信は proxy を通して確かめる。

```bash
curl -D - -o /dev/null http://localhost:8080/files/hum0009/example.zip   # 応答の header を見る
```

`X-Content-Type-Options: nosniff` が付き、画像 (SVG を除く) と PDF 以外に `Content-Disposition: attachment` が付いていれば正しい ([files.md](files.md) の「配信の安全」)。開発の proxy は、設定を bind mount した nginx の image そのままである。設定を変えたら `docker compose restart proxy` を打つ。`up -d` では反映されない。build の出力を含まないので、静的ファイルも dev サーバーが返す。

### アシスタント

アシスタントは既定では起動しない。使うときは、`.env` に `HUMANDBS_ASSISTANT_ORIGIN=http://assistant-api:8000` を書き、`env.dev` にある `HUMANDBS_ASSISTANT_` で始まる変数を埋めてから (Google Cloud の鍵の置き方は `assistant-api/README.md`)、`docker compose --profile assistant up -d` で起動する。

## 画面の規則の置き場

画面の規則は文章ではなく、source を読んで判定するテストに書いてある。間隔・角丸・幅は `app/app.spacing.test.ts`、色とコントラストは `app/app.contrast.test.ts`、リンクの行き先は `app/app.navigation.test.ts`、アイコンは `app/components/icons.test.ts`、状態のバッジは `app/components/flags.test.tsx`、文言と文体は `app/i18n/messages.test.ts` にある。

- 規則を変えるときはテストを変える。例外を足すなら、その理由もテストに書く。
- 画面の文言は `app/i18n/messages.ts` に置く。ドメインの語の意味は [concepts.md](concepts.md) に従う。
- 部品の一覧は `http://localhost:8080/dev/ui` (`app/routes/dev-ui.tsx`) で見られる。部品は多くの画面で共有しているので、見た目を変えたら変更の前後をここで見比べる。
- 部品の一覧は本番の build には入らない。`app/routes.ts` が `NODE_ENV` で分け、`app/routes.test.ts` がそれを確かめる。
- 部品の一覧に並ぶ行は、開発用データから 1 度取って固定したもの (`app/routes/dev-ui.data.ts`) である。一覧の行の型が変わったら手で取り直す。

## e2e

e2e は配置した環境に対して回す ([testing.md](testing.md) の「e2e」)。手元の compose に向けることもできる。

```bash
docker compose --profile e2e run --rm e2e                                                    # 手元の proxy に対して回す
docker compose --profile e2e run --rm -e HUMANDBS_E2E_BASE_URL=https://example.invalid e2e   # 指定した URL に対して回す
```

ログインが要るシナリオは、回す先で作ったセッションを渡して回す。このセッションの利用者は admin になるので、済んだら消す。

```bash
export HUMANDBS_E2E_SESSION=$(docker compose exec -T app npm run --silent e2e:session)   # セッションを作る
docker compose --profile e2e run --rm -e HUMANDBS_E2E_SESSION e2e                         # セッションを渡して回す
docker compose exec -T app npm run e2e:session -- clean                                   # セッションと admin を消す
```

## やっていないこと

- Keycloak を手元で起動すること。DDBJ 所管の staging の realm を使う。
- proxy 以外の port をホストに公開すること。S3 と filer を直接読める入口を作らないためで、DB も同じである。
- フォーマッタを別に入れること。整形は eslint (`@stylistic`) が検査する。
- ホストで実行する前提の script。実行は container の中で行う。例外は、docker を操作する `scripts/seed-jga-dev.sh` だけである。
- 外部から取ってきたデータを画面から取り直すこと。取り直すのはアプリのプロセスと CLI で、画面は結果を表示するだけである。
