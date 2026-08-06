# 開発環境

依存サービスも含めて compose で立てる。**開発コマンドはすべて container の中で実行する** —
ホストの Node で `npm` を直接叩くと、container 内の `node_modules` (named volume) とホストの状態が
食い違う。

## 前提

Docker と Docker Compose だけ。Node もホストには要らない。

## 初回セットアップ

```bash
cp .env.example .env
docker compose run --rm --no-deps app npm install
docker compose up -d
```

`http://localhost:8080/` が開けば起動している。`/healthz` は依存サービスの疎通を返し、1 つでも
落ちていれば 503 になる。

`npm install` を先に走らせるのは、`node_modules` が named volume にあり image に焼かれていないため。
`docker compose down -v` で volume を消したら install からやり直す。

## サービス

| service | 中身 | ホストからの見え方 |
|---|---|---|
| `proxy` | nginx。`/files/` を `s3` に、それ以外を `app` に渡す | `8080` |
| `app` | React Router の dev サーバー | proxy 経由のみ |
| `db` | Postgres + PGroonga | `127.0.0.1:5432` |
| `s3` | SeaweedFS (master / volume / filer / S3 API) | 公開しない |

**proxy を通すのは本番の経路をそのまま再現するため。** ファイル配信の `X-Content-Type-Options` と
`Content-Disposition` は proxy が付けるので、S3 API を直接叩ける口があるとその header を迂回した
URL が同じ object に生まれる。filer の HTTP は完全に無認証で非公開 bucket の中身まで返すので、
こちらも同じ理由で閉じている (詳細は [data-model.md](data-model.md) の「ファイル」)。

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
docker compose exec app npm run db:push     # schema 定義を DB に反映
```

`app` が起動していないときは `docker compose run --rm --no-deps app <command>` で単発実行する。ただし
**`npm test` と `test:db` は `db` を使う** — schema の不変条件を実際の Postgres に対して確かめるので、
`--no-deps` を付けると落ちる。`test:unit` は依存を持たない。階層の分け方と何を test にするかは
[testing.md](testing.md)。

## DB を触る

```bash
docker compose exec db psql -U humandbs -d humandbs
```

PGroonga は初回の initdb で入る (`docker/db/initdb/`)。入っているかは
`SELECT extname, extversion FROM pg_extension` で見る。initdb は volume が空のときにしか走らないので、
拡張や初期 SQL を足したら `docker compose down -v` からやり直す。

schema を DB に入れるのは `npm run db:push`。**migration file を持たない**ので、定義を変えたら push し
直して開発用データを作り直す。全文検索の生成列と PGroonga の index も schema 定義に含まれるので、
別途 SQL を流す手順は無い。

**PGroonga の index は `pg_relation_size` に出ない。** 実体が Groonga 側の別ファイル
(`base/{dboid}/pgrn.*`) にあるため。このファイルは投入のたびに増え、`DROP INDEX` でも `REINDEX` でも
縮まない。しかも疎ファイルなので `ls -l` と `du -sb` は実使用の数倍を表示する (実ブロックを見るなら
`du -s --block-size=1` か `find -printf %b`)。開発中に膨らんだら volume ごと作り直すのが早い。

**crash した後は index を作り直す。** 壊れたかどうかは、heap の走査 (`LIKE`) と index 経由 (`&@~`) で
同じ条件を数えて突き合わせれば分かる。index が無い状態でも `&@~` は seq scan で正しい結果を返すので、
作り直すまでの間も検索は動く (この規模で 100 倍ほど遅くなる)。`pg_dump` / `pg_restore` は index の定義を
そのまま運ぶので、PGroonga のために足す手順は無い。

## 開発用データを入れる

v1 の Elasticsearch dump から、公開されている research・その公開版・それらの版が listing している
dataset を読み込む。**画面を書くための実データを用意するのが目的で、値の正しさも網羅性も問わない。**

```bash
cp <v1 repo>/.claude/joomla-es/data/es/prod/{research,research-version,dataset}.json migration/input/
docker compose exec app npm run db:load-dev-data
```

`migration/input/` は git 管理外。数秒で終わり、**全部を 1 つのトランザクションで置き換える**ので、
途中で落ちても前のデータが残る。**test は開発用 DB を空にする**ので、test の後は入れ直す。

意図的にやっていないことがある。どれも機械的な変換ではなく判断が要るもので、本番のデータを作る移行の
側で決める。

- 共有された experiment ブロックを dataset ごとに割ること
- `rawHtml` にしか残っていない markup の回収
- 自由文に残ったリンクを型付きの値へ移すことと、上付き・下付きを Unicode に置き換えること
  (文の markdown は木にするが、畳み方の判断はしない)
- catalog のキーへの語彙型・数値型の割り当て (公開区分だけ語彙にしてある)
- dataset のファイル選択の初期値
- サイトコンテンツ (document / news / navigation) の取り込み

schema を変えたら `npm run db:push` の後にもう一度流す。

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
- **`db` 以外の port をホストに出さない。** S3 と filer を直接叩ける口を作らない
- **フォーマッタを別に入れない。** 整形は eslint (`@stylistic`) が持つので、`npm run lint:fix` で直す
- **ホストでの実行を前提にした script を置かない**
