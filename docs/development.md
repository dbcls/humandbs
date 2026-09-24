# 開発環境

手元で動かし、変更を確かめる手順。部品の構成は [architecture.md](architecture.md)、test の方針は
[testing.md](testing.md)、配置は [deployment.md](deployment.md)。

**要るのは Docker と Docker Compose だけ。開発コマンドはすべて container の中で打つ** — `node_modules` は
named volume にあり、ホストの `npm` を叩くと状態が食い違う。

## 守ること

- **production 環境を直接変更しない。** 検証は staging で行い、production からのコピーは読み取りだけ
- **JGA 申請管理システムの DB は他プロジェクトの所管。** schema の変更も書き込みもせず、接続は
  read-only を強制する。staging に実データが無いので、読むのは production
- **仕様が絡む変更は `docs/` を先に直す。** 型と値の一覧はコードが持つので、docs に写さない
- **作業の経緯を成果物に持ち込まない。** コメント・test 名・docs・commit message は現在の意図だけを言う
- **route を触ったら `npm run build` も通す。** route module の `loader` / `action` / `middleware` /
  `headers` 以外が `.server` の module に依存すると、client の遷移でだけ 500 になる。SSR も lint も
  typecheck も test も通り、見ているのは build だけ

## 初回

```bash
cp env.dev .env
docker compose run --rm --no-deps app npm install
docker compose up -d
docker compose exec app npm run db:migrate:dev
docker compose exec app npm run s3:buckets
docker compose exec app npm run icd10:import
```

**`.env` の `COMPOSE_FILE` が開発の定義を重ねる。** `compose.yml` は配信の定義で、`compose.dev.yml` を
重ねて初めて source の bind mount と dev サーバーになる。この行が無いと、`docker compose` は本番の image を
build して立てる。`env.dev` より前に作った `.env` には、`COMPOSE_FILE=compose.yml:compose.dev.yml` を
1 行足す。

`http://localhost:8080/` が開けば起動している。`/healthz` は依存サービスへの疎通で、1 つでも落ちていれば
503。`db:migrate:dev` はアプリの role と test 用の database も作る。`s3:buckets` が要るのは、bucket を書き込みの
副作用で作らないから (どちらの bucket に居るかが公開状態なので)。`icd10:import` は ICD10 の配布物を取って
くる (repo に置かない)。

proxy が 8080 で受けるのは、Keycloak (DDBJ の staging) に `http://localhost:8080/auth/callback` が
登録済みだから。`HUMANDBS_PUBLIC_PORT` を変えるとサインインは通らない。アプリが読む環境変数は
`HUMANDBS_` で始まる。

## 日常のコマンド

```bash
docker compose exec app npm run lint          # 整形も eslint (@stylistic)。直すのは lint:fix
docker compose exec app npm run typecheck
docker compose exec app npm run test:unit     # 不変量 + 単体。DB を使わない
docker compose exec app npm run test:db       # schema + 経路。db が要る
docker compose exec app npm test              # 両方
docker compose exec app npm run build
```

`app` が止まっているときは `docker compose run --rm --no-deps app <command>` で単発に打てる。ただし
`test:db` は `db` を使うので `--no-deps` を付けない。**`test:db` を 2 つ同時に走らせない**
([testing.md](testing.md))。

## DB を触る

```bash
docker compose exec db psql -U humandbs -d humandbs         # test 用は -d humandbs_test
```

**role は 2 つ。** `humandbs` が schema を持ち、`humandbs_app` がアプリと test の繋ぐ先で、event を
書き換えられずどの表も TRUNCATE できない ([publishing.md](publishing.md) の「証跡」)。psql は owner で
入る。**database も 2 つ** — 開発用と `_test` 付きの test 用で、test は後者だけを空にする。

**schema を変える道は開発でも配信でも 1 つ — 定義 (`app/db/schema/`) を書き、`npm run db:generate` で
`drizzle/` に SQL を書き出し、それを当てる。** 開発では `npm run db:migrate:dev` が開発用と test 用の
両方に当て、role と権限も張り直す。全文検索の生成列と PGroonga の索引も定義に含まれる。配信先への
当て方は [deployment.md](deployment.md) の「schema を変える」。

```bash
docker compose exec app npm run db:generate      # 書いた定義との差を drizzle/ に SQL で書き出す
docker compose exec app npm run db:migrate:dev   # 定義との食い違いを確かめてから、両方の database に当てる
```

- **`drizzle-kit push` は使わない。** 複数列の unique 制約・複合主キー・PGroonga の索引を、同じなのに
  毎回作り直そうとする。行があると対話の確認で止まり、TTY が無いと何も反映しないまま終了コード 0 で終わる
- **定義を書いて書き出し忘れると test が落ちる。** `app/db/schema-drift.test.ts` が、`drizzle/` の写しに
  書き出してみて新しいファイルができないことを見る (`npm run db:check` も同じ)。drizzle-kit は失敗しても
  終了コード 0 を返すので、書き出しの結果は出力の文で確かめている
- **書き出した SQL は読んでから commit する。** 手で直してよい。まだ出していない migration は、消して
  書き出し直せば 1 本にまとまる (当てた DB は、その分を戻してから)
- **test 用の database は当てた記録が無ければ作り直す。** test が毎回空にするので、残すものが無い
- **開発用データを作り直すなら、schema も空から当て直せる**

```bash
docker compose exec db psql -U humandbs -d humandbs \
  -c "DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public; CREATE EXTENSION pgroonga;"
docker compose exec app npm run db:migrate:dev
docker compose exec app npm run db:load-dev-data
```

PGroonga は volume が空のときの initdb で入る (`docker/db/initdb/`)。初期 SQL を変えたら
`docker compose down -v` からやり直す。PGroonga の索引の実体は Groonga 側のファイルで、
`pg_relation_size` に出ず、`DROP INDEX` でも縮まない。膨らんだら volume ごと作り直す。crash の後は
索引を作り直す。

## 開発用データを入れる

画面を書くための実データを用意する。**値の正しさも網羅性も問わない** — 本番のデータを作るのは
[deployment.md](deployment.md) の移行。入力は `migration/input/` (git 管理外) に置く。

| 入力 | 中身 |
|---|---|
| `research.json` `research-version.json` `dataset.json` | 旧ポータルの検索基盤の dump |
| `cms.json` | 旧ポータルの CMS (staging) のサイトコンテンツ。production には接続しない |
| `jga_study_hum_id.tsv` `jga_dataset_hum_id.tsv` `jga_dataset_study.tsv` | 研究 ID ↔ JGA accession の対応と JGAD → JGAS の辺。3 本とも無いと失敗する |
| `alert-translations.json` | 表示中のアラートの、欠けた側の言語の訳 |

```bash
docker compose exec app npm run icd10:import       # 先に。配布物が無いと移行は止まる
docker compose exec app npm run db:load-dev-data
docker compose exec app npm run s3:common-assets   # 記事が参照する画像と PDF
docker compose exec app npm run db:seed-review     # レビューの姿の下書きを足す (任意)
```

- **全部を 1 つのトランザクションで置き換える**ので、途中で落ちても前のデータが残る。admin と session は
  消さない。schema を変えたら `db:migrate:dev` の後に流し直す
- **サイトコンテンツは本番と同じ変換を通る。** 本文の生 HTML は markdown になり、扱えない記法に出会うと
  止まる
- **`s3:common-assets` は本文が指しているものだけを旧ポータル (`HUMANDBS_LEGACY_ORIGIN`) から運ぶ。**
  取ったものは `migration/input/public-files/` に残り、2 回目からは外に出ない
- **`db:seed-review` は、コメント・印・未確定の欄を持つ共有中の下書きなどを足す。** べき等で、
  `db:load-dev-data` を流し直したら打ち直す
- 外部 accession の日付は dump の初出日から作る。JGAD の日付は申請管理システムに届かないので入らない

## サインインと admin

`.env` の `HUMANDBS_AUTH_*` 3 行は `env.dev` の値のまま (DDBJ の staging の Keycloak、public client +
PKCE なので secret は無い)。http の手元では cookie に `Secure` が付かない。

```bash
# ヘッダからサインインして /admin を開くと、自分の sub が出る
docker compose exec app npm run admin:grant -- <sub> "表示名"
# /admin を開き直す。外すのは admin:revoke -- <sub>、一覧は admin:list
```

## 上流

**外部キャッシュはアプリのプロセスが日次で取り直す。** 手で打つこともでき、そのときは期限を見ずに走る。

```bash
docker compose exec app npm run upstream:refresh
docker compose exec app npm run upstream:refresh -- --source=archive-date
```

`archive-date` (DDBJ Search) は手元でも回る。残る 3 つは申請管理システム DB を読み、
`HUMANDBS_JGA_DATABASE_URL` が空なら skip する。**その DB は踏み台の内側にしか無い**ので、手元では空の
ままにする。結果は `/admin` に出る。

**申請から下書きを作る画面を手元で見るには、申請管理システムの足場を入れる。**

```bash
scripts/seed-jga-dev.sh
docker compose up -d --force-recreate app   # .env を読み直させる (restart では読まない)
```

足場は開発用の DB の別 schema (`jgasys`) に作り、`.env` の `HUMANDBS_JGA_DATABASE_URL` を
`HUMANDBS_DATABASE_URL` と同じに、`HUMANDBS_JGA_DB_SCHEMA` を `jgasys` にする。**prod の複製ではない** —
DDL は prod の列定義から機械で作ったもので、材料は repo の外にある (script の冒頭)。手元で通った SQL が
prod で通ることは保証しない。

## ファイルストア

`files` が公開 bucket、`private` が非公開。anonymous に読ませる grant は `docker/s3/s3.json.template` に
あり、鍵は `.env` から起動時に埋めるので、鍵を変えたら `docker compose up -d s3`。配信は proxy 経由で
確かめる。

```bash
curl -D - -o /dev/null http://localhost:8080/files/hum0009/example.zip
```

`X-Content-Type-Options: nosniff` と、SVG と画像・PDF 以外に `Content-Disposition: attachment` が付けば
正しい ([files.md](files.md) の「2 つの bucket」)。
**proxy の設定を変えたら `docker compose restart proxy`** — 開発の proxy は設定を bind mount した素の
nginx で、`up -d` では変わらない。build を持たないので、静的ファイルも dev サーバーが返す。

## アシスタント

既定では立たない。`.env` に `HUMANDBS_ASSISTANT_ORIGIN=http://assistant-api:8000` と、`env.dev` の
`HUMANDBS_ASSISTANT_` で始まる変数を書き (Google Cloud の鍵は `assistant-api/README.md`)、立てる。

```bash
docker compose --profile assistant up -d
```

## 画面の規則

**画面の規則は文章ではなく、source を読んで判定する規則 test が持つ** — 間隔・角丸・幅は
`app/app.spacing.test.ts`、色とコントラストは `app/app.contrast.test.ts`、リンクの行き先は
`app/app.navigation.test.ts`、印は `app/components/icons.test.ts`、状態のバッジは
`app/components/flags.test.tsx`、文言と文体は `app/i18n/messages.test.ts`。**規則を変えるのは test を
変えること**で、例外を足すならその理由も test の側に書く。画面の語は `app/i18n/messages.ts` が持ち、
ドメインの語は [glossary.md](glossary.md) に従う。

部品の実物は `http://localhost:8080/dev/ui` (`app/routes/dev-ui.tsx`) に全部並ぶ。部品は多くの画面が
共有しているので、見た目を変えたら変える前と後をここで見比べる。本番の build には入らない
(`app/routes.ts` が `NODE_ENV` で分け、`app/routes.test.ts` が守る)。並ぶ行は開発用データから 1 度取って
凍結したもの (`app/routes/dev-ui.data.ts`) で、view の型が変わったら手で取り直す。

## e2e

配置した実物に対して回す ([testing.md](testing.md))。この compose に向けることもできる。

```bash
docker compose --profile e2e run --rm e2e
docker compose --profile e2e run --rm -e HUMANDBS_E2E_BASE_URL=https://example.invalid e2e
export HUMANDBS_E2E_SESSION=$(docker compose exec -T app npm run --silent e2e:session)
docker compose --profile e2e run --rm -e HUMANDBS_E2E_SESSION e2e
docker compose exec -T app npm run e2e:session -- clean   # 済んだら admin を外す
```

## 作り直す

```bash
docker compose down -v                 # volume ごと (DB・S3・node_modules)
docker compose build --no-cache app
```

volume を消したら初回の手順からやり直す。

## 意図的にやっていないこと

| やらないこと | 理由 |
|---|---|
| Keycloak を手元に立てること | DDBJ 所管の staging の realm を使う |
| proxy 以外の port をホストに出すこと | S3 と filer を直接叩ける口を作らない。DB も同じ |
| フォーマッタを別に入れること | 整形は eslint (`@stylistic`) が持つ |
| ホストでの実行を前提にした script | 実行は container の中 |
| 上流のキャッシュを画面から取り直すこと | 走らせるのはプロセスと CLI で、画面は結果を出すだけ |
