# 本番と staging の運用

staging と production にポータルを配置し、更新し、データを入れる手順をまとめる。手元の開発環境は [development.md](development.md)、部品の構成は [overview.md](overview.md) にある。

staging と production は、この repo から作った image で動く。配置の定義は `compose.yml` で、source は mount しない。配置先は rootless podman と podman-compose 1.0.6 なので、コマンドは `podman-compose` で書き、配置先で要る設定は `compose.deploy.yml` が足す。配置先ごとに違う値は `.env` にだけ書く。開発環境は、同じ定義に `compose.dev.yml` を重ねたものである。

## 構成

どの image をどの service で使い、proxy が何を処理するかの話である。

| image (Dockerfile の target) | 中身 | 使う service |
|---|---|---|
| `runtime` | build の出力と production の依存だけ。`node` で動く | `app` |
| `proxy` | nginx とその設定、build の出力のうち client 側 (静的ファイル) | `proxy` |
| `tools` | すべての依存と source。TypeScript を tsx で動かす | `migrate`、`tools` |

- 配置する container に schema の owner の接続を渡さない。`app` に渡すのは `humandbs_app` (操作の記録を書き換えられない role) の URL だけで、owner の URL は `migrate` と `tools` にだけ渡す。1 回だけ行う操作 (admin の追加と削除、bucket の作成、ICD10 の取り込み、データの移行) は `tools` で実行する。例は `podman-compose run --rm -T tools npm run admin:list` である。
- dev サーバーを配置に使わない。vite は知らないホスト名の要求を拒否し、`react-router-serve` は `NODE_ENV` が production でないと例外の stack trace を返し、部品の一覧 (`/dev/ui`) は build したものにだけ入らないためである。待ち受ける port は dev サーバーと同じなので、nginx の設定は 1 つで済む。
- 静的ファイルは proxy が返す。proxy の image にあるファイルはそこから返し、無いものは `app` に渡す。`app` の image も同じファイルを含むので、proxy に無いファイルも返せる。`/assets/` の下はファイル名に中身の hash が入るので 1 年の期限を付け、それ以外 (アイコン、`robots.txt`) と画面には付けない。
- 圧縮も proxy が行う。nginx の image は `gzip` が off なので、`docker/nginx/default.conf` で on にし、圧縮の水準を 5 にしている。
- 安全のための header (CSP・`X-Frame-Options`・`nosniff`・`Referrer-Policy`) は、proxy がすべての応答に付ける。値は `docker/nginx/default.conf` にある。アプリが自分で `Referrer-Policy` を決めた応答 (共有リンク) はその値を残す。配信するファイルの header は [files.md](files.md) の「配信の安全」にある。
- proxy は平文で待ち受け、TLS はホストの外の終端で処理する。proxy が `Strict-Transport-Security` を付けるのは、TLS の終端が `X-Forwarded-Proto: https` を渡したときだけである。終端がこの header を渡さないなら、HSTS は終端の側で付ける。
- アシスタント (`assistant-api`) は `assistant` network にあり、同じ network にいるのは `app` だけである。アシスタントからは DB・ファイルストア・filer に接続できない。外部への通信はできる。

### podman-compose 1.0.6 に合わせていること

compose の定義は podman-compose 1.0.6 が解釈できる範囲で書いている。

- profile を解釈しないので、`up` には起動する service を並べて書く。
- `depends_on` は起動の順番にしか効かないので、`migrate` は `up` の前に手で実行する。
- healthcheck は `CMD-SHELL` で書く。`CMD` の配列は引用符を正しく扱わない。
- あとの file で上書きする volume は、元の file で `{}` と書く。

## .env

`.env` は配置先ごとの値を書く file である。[`env.staging`](../env.staging) か [`env.production`](../env.production) を `.env` にコピーし、`CHANGE_ME` を埋める。配置で特に重要なのは次の変数である。

| 変数 | 配置での意味 |
|---|---|
| `HUMANDBS_AUTH_REDIRECT_URI` | サイトの origin はこの値から決まる。presigned URL の宛先と cookie の `Secure` もここで決まるので、外から実際に見えるアドレスを書く |
| `HUMANDBS_PUBLIC_BIND_HOST` / `HUMANDBS_PUBLIC_PORT` | proxy の待ち受け。TLS の終端が別のホストなので `0.0.0.0` にする |
| `HUMANDBS_DATABASE_URL` / `HUMANDBS_OWNER_DATABASE_URL` | アプリの role と schema の owner。アプリの role は `migrate` が URL のとおりに作る |
| `HUMANDBS_JGA_DATABASE_URL` | 申請管理システムの DB。配置先 (踏み台の内側) からは直接接続できるので、手元と違って値を埋める |
| `HUMANDBS_S3_ACCESS_KEY` / `HUMANDBS_S3_SECRET_KEY` | ファイルストアの鍵。配置先ごとに作る (下の「ファイルストアの鍵」) |
| `HUMANDBS_DATA_DIR` | DB とファイルストアのデータと、DB の backup を置く dir (下の「データの置き場」) |

redirect URI は Keycloak の client にも登録されている必要がある。登録が無いと認可要求が `400 Invalid parameter: redirect_uri` で失敗し、公開ページは表示されるのにログインだけができない状態になる。新しいアドレスで配置するときは、先に登録を依頼する。

### ファイルストアの鍵

非公開 bucket のファイルを読めるかどうかは、URL に付いた署名だけで決まる。`/private/` は proxy が外部に公開しているためである。署名に使う鍵は `.env` の 2 行なので、template の値や他の配置先の値のまま使うと、その値を知る人は誰でも非公開 bucket の署名を作れる。

- 鍵は配置先ごとに新しく作る。値に `|`・`&`・`\`・`"` を含めない。起動時に `sed` で JSON に埋め込むためである。
- 同じ鍵をアプリとファイルストアの両方が使い、ファイルストアは起動時にしか鍵を読まない。`.env` を変えると定義の hash が変わるので、次に `podman-compose up -d db s3 app proxy` を実行すると両方が作り直される。

## データの置き場

DB とファイルストアのデータをホストのどこに置くかの話である。

- DB (`pgdata`) とファイルストア (`s3data`) の中身は、`HUMANDBS_DATA_DIR` の下の `pgdata/` と `s3data/` に置く。podman は named volume を container の実行環境の中に置くが、配信するデータ (特に数 TB の配信ファイル) はホストを移ったり実行環境を作り直したりしても残る場所に置く必要がある。そのため `compose.deploy.yml` が 2 つの volume をこの dir への bind にしている。
- volume の名前は project 名 (配置先の dir 名) と volume の key から決まるので、dir 名も key も変えない。`down -v` は実行しない。
- 2 つの dir は最初の起動の前に作り、配置先のユーザーの所有にする。
- `compose.deploy.yml` の `userns_mode` (`keep-id`) は、`db`・`s3`・`tools` の container の中のユーザーを、配置先のユーザーに対応させる設定である。rootless podman では container の中の root 以外のユーザーがホストでは別の uid になるので、この設定が無いと bind した dir に書けないか、持ち主の分からないファイルが残る。置き場が共有のファイルシステムのときに特に問題になる。`tools` に要るのは、データの移行が `migration/input/` にレポートを書き、ファイルの搬入が配置先のユーザーの dir を読むためである。
- DB を置く場所は書き込みの速さを見て選ぶ。書き込みの確定 (fsync) の時間は置き場の速さで決まる。ただしポータルへの書き込みは admin の操作だけなので、fsync に 1 回 1 ms 程度かかる置き場でも画面の速さには影響しない。
- DB の backup は `HUMANDBS_DATA_DIR/backup/` にたまる。更新のたびに、migration の前に `pg_dump -Fc` で `<日時>-before-<tag>.dump` を作る。古い backup は手で消す。backup はデータと同じファイルシステムにあるので、防げるのは migration の失敗であり、置き場の故障ではない。

## 初回

配置先に初めてポータルを起動する手順である。配置先の dir で、配置先のユーザーとして実行する。

```bash
git clone -b v2 <repo> <dir> && cd <dir>                     # source を取得する
cp env.production .env                                       # staging なら env.staging。CHANGE_ME を埋める
ln -s compose.deploy.yml compose.override.yml                # 配置先の設定を読み込ませる
mkdir -p <HUMANDBS_DATA_DIR>/pgdata <HUMANDBS_DATA_DIR>/s3data   # .env に書いた dir の下にデータの dir を作る
podman-compose build app proxy tools migrate                 # image を作る
podman-compose up -d db s3                                   # DB とファイルストアを起動する
podman-compose run --rm -T migrate                           # schema を当て、アプリの role と権限を作る
podman-compose up -d db s3 app proxy                         # アプリと proxy を起動する
podman-compose run --rm -T tools npm run s3:buckets          # 2 つの bucket を作る
podman-compose run --rm -T tools npm run icd10:import        # ICD10 を取り込む
```

- 依存の service を先に起動するのと `-T` を付けるのは、`podman-compose run` の制約のためである。`--no-deps` を付けても依存の container が要り、TTY の無い環境では `-T` を付けないと container の作成が失敗する。
- `/healthz` が 200 を返せば、依存サービスに接続できている。1 つでも接続できなければ 503 になる。

## 更新

新しい source で配置先を更新する手順である。

```bash
git pull               # source を更新する
scripts/deploy.sh      # tag を省くと、checkout している commit の短い hash を tag にする
```

`scripts/deploy.sh` は次の順に進む。新しい image を作り終え、migration を当てるまでは、古い `app` と `proxy` が配信を続ける。

1. 4 つの image (`app`・`proxy`・`tools`・`migrate`) を build し、tag を付ける。
2. DB の backup を取る。
3. migration を当てる。
4. `proxy`、`app` の順に止めて作り直し、`/healthz` が 200 を返すまで待つ。止まるのはこの数秒だけで、DB とファイルストアは止めない。

- proxy も毎回作り直す。新しいバージョンの静的ファイルは新しい proxy の image にあり、nginx は `app` のアドレスを起動時に 1 度しか引かないためである。
- `compose*.yml` か `.env` が変わっていると、podman-compose は DB とファイルストアの container も作り直す。定義の hash が合わない container を消してから起動するためである。データは volume にあるので消えない。
- 1 回だけ実行する container (`run`) が動いている間は更新しない。script も実行を断る。その container は DB とファイルストアに依存しているので、作り直すと途中で失敗する。

## 戻す

前のバージョンに戻す手順である。更新のたびに付けた tag の image は残っているので、image を入れ替えるだけでどのバージョンにも戻せる。要らなくなった tag の image は `podman image rm` で消す。

```bash
scripts/deploy.sh rollback <tag>      # その tag の image に入れ替える。migration は実行しない
```

戻したバージョンが今の schema で動かないときは、DB も backup から戻す。backup を取ったあとに書かれた内容 (admin の編集) は失われる。`<project>` は配置先の dir 名である。

```bash
podman stop -t 10 <project>_proxy_1 && podman stop -t 2 <project>_app_1                     # proxy とアプリを止める
podman exec <project>_db_1 dropdb -U humandbs humandbs                                        # database を消す
podman exec <project>_db_1 createdb -U humandbs humandbs                                      # 空の database を作る
podman exec -i <project>_db_1 pg_restore -U humandbs -d humandbs --exit-on-error < <backup>.dump   # backup を戻す
podman-compose run --rm -T migrate                                                            # 権限を設定し直す
podman start <project>_app_1 && podman start <project>_proxy_1                               # アプリと proxy を起動する
```

role は database の外にあるので dump に入らず、database への接続の権限は作り直した database から消えている。それを `migrate` が設定し直す。権限だけを設定するなら `tools` で `npm run db:grants` を実行してもよい。

## schema を変える

配置先の schema を変える方法の話である。`drizzle/` に書き出して commit した SQL だけが配置先の schema を変える。書き出し方は [development.md](development.md) の「DB と schema の変更」にある。

- `migrate` は owner で接続し、まだ当てていない migration を 1 つのトランザクションで当て、続けて `humandbs_app` の権限を設定し直す。新しい表は、権限を設定し直すまでアプリから読めない。当てた記録は DB の `drizzle.__drizzle_migrations` にある。
- `drizzle-kit push` は配置先でも使わない。理由は [development.md](development.md) の「DB と schema の変更」にある。
- migration は、1 つ前のリリースのアプリが動き続ける形にする。更新では migration を当ててからアプリを入れ替えるので、その間は古いアプリが新しい schema で動く。戻すときも同じである。1 つのリリースでは列や表を足すだけにし (既存の行に要る値は default で与える)、消す・名前を変える・型を狭めるのは、それを使うコードが無くなった次のリリースで行う。
- 更新では、`scripts/deploy.sh` が DB の backup を取ってから migration を当てる。

### push で作った DB を migration の管理に載せる

`drizzle-kit push` で schema を作った DB には migration を当てた記録が無いので、`migrate` は実行を断る。この DB は、最初の migration (`drizzle/` の baseline) と schema が同じことを確かめてから、baseline を当てた記録だけを付ける。比べるのは `scripts/schema-fingerprint.sql` の出力で、列の並び順を除いた schema の形を 1 行ずつ出す。

```bash
podman exec <project>_db_1 createdb -U humandbs humandbs_baseline_check        # 比較用の database を作る
podman-compose run --rm -T -e HUMANDBS_OWNER_DATABASE_URL=<owner の URL>_baseline_check \
  -e HUMANDBS_DATABASE_URL=<アプリの URL>_baseline_check migrate                # 比較用の database に migration を当てる
for d in humandbs humandbs_baseline_check; do
  podman exec -i <project>_db_1 psql -U humandbs -d $d -At -f - < scripts/schema-fingerprint.sql > $d.shape
done                                                                           # 2 つの schema の形を書き出す
diff humandbs.shape humandbs_baseline_check.shape && \
  podman-compose run --rm -T migrate npm run db:mark-baseline                  # 差が無ければ baseline の記録を付ける
podman exec <project>_db_1 dropdb -U humandbs humandbs_baseline_check          # 比較用の database を消す
```

- 2 つの URL は、`.env` の値の末尾に `_baseline_check` を足したものである。role と password は `.env` のままにする。role は database の外にあり、`migrate` はアプリの role の password を URL の値に設定し直すためである。
- 差が出たら記録を付けず、差を無くしてから比べ直す。
- 記録は、migration の記録が 1 件も無い DB にしか付けられない。
- podman-compose 1.0.6 の `-e` は値を `=` で区切るので、password に `=` を含むときはこの手順を使えない。

## データを入れる

本番で公開するデータを入れる手順である。データは本番用の移行が作る。入力は旧ポータル (v1 の検索基盤と CMS、その前の Joomla) を固定した snapshot で、DB を空にしてからすべてを入れ、そのあと配信ファイルをファイルストアに運ぶ。画面を開発用データで確かめるだけなら、手元と同じ手順で入る ([development.md](development.md) の「開発用データ」)。

- 入力は image にも repo にも入らないので、`migration/input/l12/` に手で置く。`tools` はこの dir を mount し、移行のコードは image から読む。移行のコードを直したら `podman-compose build tools` を実行する。

```bash
podman-compose run --rm -T tools npx tsx migration/production.ts     # DB を空にして移行する
podman-compose run --rm -T \
  -v <旧ポータルの files の dir>:/source/files:ro \
  -v <旧ポータルの public-files の dir>:/source/public-files:ro \
  tools npx tsx migration/carry-files.ts                              # 配信ファイルをファイルストアに運ぶ
```

- 移行は実行するたびに DB を空にしてから入れる。規則で決められなかったものを人が直した結果は、DB ではなく `migration/input/l12/hand/` の表に書き、移行がそれを読む。DB を直接直すと、次に移行を実行したときに消える。
- 規則で決められずに残ったものは `migration/input/l12/out/` に書き出される。
- ファイルの搬入は途中で止めて実行し直せる。ファイルストアに同じ大きさのファイルが既にあれば飛ばすので、2 回目は残りだけを運ぶ。
- DB を入れ直したら、搬入ももう一度実行する。非公開のファイルは研究の実体ごとの研究のフォルダに置いており、入れ直すと研究の実体が新しくなるためである。古い実体のフォルダに残ったファイルは `out/carry-report.json` の `stray` に並ぶ。
- 何を運ばないか (同じデータの別の形式、新しいものに置き換えられた古いファイル、作業用のファイル、研究のフォルダの外の資料) と、どれを非公開 bucket に入れるかは `migration/carry.ts` が決める。研究のフォルダの中の階層はなくし、ファイル名だけを key にする ([files.md](files.md) の「2 つの bucket と研究のフォルダ」)。

## やっていないこと

- blue-green の切り替え。入れ替えの数秒は止まる。container の名前も proxy の port も 1 組しかない。
- `migrate` を `app` の起動に結び付けること。podman-compose 1.0.6 は完了を待つ依存を扱えず、結び付けると終了した container に `app` の起動が左右される。
- 環境ごとに compose の file を分けること。違いは `.env` に書き、env の template は値の雛形でしかない。
- 配置先のアドレスやホスト名を repo に書くこと。
- アシスタントを既定で起動すること。起動するときは `podman-compose up -d` に `assistant-api` を加える。
