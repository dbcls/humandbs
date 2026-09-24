# 配信する

staging と production は、この repo から作った image で動く。`compose.yml` が配信の定義で、source は
mount しない。配信先は rootless podman + podman-compose 1.0.6 なので、コマンドは `podman-compose` で
書き、その環境に要るものは `compose.deploy.yml` が足す。**配置先ごとに違う値は `.env` だけが持つ**。
開発は同じ定義に `compose.dev.yml` を重ねたもの ([development.md](development.md))。

## image と service

| image (Dockerfile の target) | 中身 | 使う service |
|---|---|---|
| `runtime` | build の出力と production の依存だけ。`node` で動く | `app` |
| `proxy` | nginx と設定、build の client 側 (静的ファイル) | `proxy` |
| `tools` | 全部の依存と source。TypeScript を tsx で動かす | `migrate`、`tools` |

**配信する container に owner の接続を渡さない。** `app` が持つのは `humandbs_app` (event を書き換え
られない role) の URL だけで、schema の持ち主の URL は `migrate` と `tools` にしか渡らない。一度きりの
操作 (admin の付け外し、bucket の作成、ICD10 の取り込み、移行) は `tools` で打つ。

```bash
podman-compose run --rm -T tools npm run admin:list
```

**dev サーバーを配信に使わない。** vite は知らないホスト名の要求を弾き、`react-router-serve` は
`NODE_ENV` が production でなければ例外の stack trace を返し、部品カタログ (`/dev/ui`) は build した
ものにだけ入らない。**待ち受ける port は dev サーバーと同じ**で、nginx の設定は 1 つしかない。

**静的ファイルは proxy が返す。** proxy の image が持つ build の client 側にあるものはそこから返し、
無いものを `app` へ渡すので、`app` は画面と API を描くだけになる。`/assets/` の下は名前に中身の hash が
入るので 1 年の寿命を付け、それ以外 (アイコン、`robots.txt`) と画面には付けない。`app` の image も同じ
ファイルを持つので、proxy に無いファイルも返る。**圧縮も proxy が掛ける** — nginx の image は `gzip` を
off で出荷するので `docker/nginx/default.conf` で立て、水準を 5 に上げている。

**安全のための header は proxy が付ける。** CSP・`X-Frame-Options`・`nosniff`・`Referrer-Policy` を
すべての応答に付け (値は `docker/nginx/default.conf`)、アプリが自分で `Referrer-Policy` を決めた応答
(共有リンク) はそれを残す。配信するファイルの header は [files.md](files.md) の「2 つの bucket」。

**HSTS は TLS を終える terminator の責任。** この proxy は平文で待ち、TLS はホストの外の terminator が
終える。proxy が `Strict-Transport-Security` を付けるのは terminator が `X-Forwarded-Proto: https` を
渡したときだけで、平文で開く手元では付かない。**terminator がこの header を渡さないなら、HSTS は
terminator の側で付ける。**

**アシスタントは `app` とだけ同じ network に居る。** `assistant` network に居るのは `assistant-api` と
`app` だけで、アシスタントから DB・ファイルストア・filer には届かない。外への通信はできる。

**podman-compose 1.0.6 に合わせて書いてある。** profile を解さないので `up` には service を並べ、
`depends_on` は起動の順番にしか効かないので `migrate` は `up` の前に手で流し、healthcheck は
`CMD-SHELL` で書く (`CMD` の並びは引用を壊す)。上書きする volume は元の側を `{}` で書く。

## `.env` が決めること

[`env.staging`](../env.staging) か [`env.production`](../env.production) を `.env` に写し、`CHANGE_ME`
を埋める。配信で意味を持つのは次のもの。

| 変数 | 配信での意味 |
|---|---|
| `HUMANDBS_AUTH_REDIRECT_URI` | **サイトの origin がこの 1 行から導かれる。** presigned URL の宛先も cookie の `Secure` もここで決まるので、外から実際に見えるアドレスを書く |
| `HUMANDBS_PUBLIC_BIND_HOST` / `HUMANDBS_PUBLIC_PORT` | proxy の待ち受け。TLS terminator が別のホストなので `0.0.0.0` |
| `HUMANDBS_DATABASE_URL` / `HUMANDBS_OWNER_DATABASE_URL` | アプリの role と schema の持ち主。前者の role は `migrate` が URL の通りに作る |
| `HUMANDBS_JGA_DATABASE_URL` | 踏み台の内側からは直接届くので、手元と違って埋める |
| `HUMANDBS_S3_ACCESS_KEY` / `HUMANDBS_S3_SECRET_KEY` | ファイルストアの鍵。配置ごとに作る (下の節) |
| `HUMANDBS_DATA_DIR` | DB とファイルストアのデータと、DB の backup を置く dir (下の節) |

**redirect URI は Keycloak の client 側にも登録されていないといけない。** 登録が無いと認可要求が
`400 Invalid parameter: redirect_uri` で落ち、サインインだけが通らない状態になる (公開ページは出る)。
新しいアドレスを立てるときは、これを先に頼む。

## データの置き場

**DB (`pgdata`) とファイルストア (`s3data`) の中身は、`HUMANDBS_DATA_DIR` の下の `pgdata/` と `s3data/` に
置く。** podman が named volume を置く場所は container の実行環境の持ち物でホストに閉じている。配信する
データ — とりわけ数 TB の配信ファイル — は、ホストを移ったり実行環境を作り直したりしても残る場所に
置きたいので、`compose.deploy.yml` が 2 つの volume をこの dir への bind にしている。**volume の名前は
project 名 (配置の dir 名) と key から決まる**ので、dir 名も key も変えない。`down -v` は打たない。

**2 つの dir は先に作り、配置先のユーザーが持つ。** 置き場が共有のファイルシステムだと、rootless podman の
下の container が書いたファイルの持ち主は、ホストの側でそのユーザーと重ねないと別の uid になり、書けないか
持ち主の分からないファイルが残る。`compose.deploy.yml` の `userns_mode` はそのためで、`db` と `s3` と
`tools` の image が中で使うユーザーを配置先のユーザーに重ねている。

**DB を置く場所は書き込みの速さを見て選ぶ。** 書き込みの確定 (fsync) は置き場の速さそのものになる。
ポータルの書き込みは admin の操作だけなので、fsync に 1 回 1 ms 程度かかる置き場でも画面には出ない。

**DB の backup は `HUMANDBS_DATA_DIR/backup/` に溜まる。** 更新のたびに migrate の前に `pg_dump -Fc` で
取る (`<日時>-before-<tag>.dump`)。消すのは手で。データと同じファイルシステムにあるので、守れるのは
migration の失敗であって、置き場の故障ではない。

## ファイルストアの鍵を作り直す

`/private/` は proxy が外に開いていて、そこに置いたものを読めるかどうかは **URL に付いた署名だけ**で
決まる。署名する鍵は `.env` の 2 行なので、**template の値や他の配置の値のまま配信すると、それを知る人が
誰でも非公開 bucket の署名を作れる。** 同じ鍵をアプリと store の両方が使い、store は起動時にしか読まない。
`.env` を変えると定義の hash が変わるので、次の `podman-compose up -d db s3 app proxy` が両方を作り直す。

## schema を変える

**`drizzle/` に書き出して commit した SQL だけが配信先の schema を変える** (書き出し方は
[development.md](development.md) の「DB を触る」)。`migrate` が owner で繋ぎ、まだ当てていない migration を
1 つの transaction で当て、続けて `humandbs_app` の権限を張り直す (新しい表はそれまでアプリから読めない)。
当てた記録は DB の `drizzle.__drizzle_migrations` にある。

**migration は 1 つ前の版のアプリが動き続ける形にする。** 更新は migration を当ててからアプリを入れ替える
ので、その間は古いアプリが新しい schema で動く。列や表は足す (既にある行に要る値は default で与える)
だけにして、消す・名前を変える・型を狭めるのは、それを使うコードが無くなった次の版で行う。1 つの版で
両方をすると、入れ替えの間の数秒と戻すときに古いアプリが落ちる。

## 初回

```bash
git clone -b v2 <repo> <dir> && cd <dir>
cp env.production .env                # staging なら env.staging。CHANGE_ME を埋める
ln -s compose.deploy.yml compose.override.yml
mkdir -p "$HUMANDBS_DATA_DIR"/pgdata "$HUMANDBS_DATA_DIR"/s3data   # .env に書いた値
podman-compose build app proxy tools migrate
podman-compose up -d db s3
podman-compose run --rm -T migrate
podman-compose up -d db s3 app proxy
podman-compose run --rm -T tools npm run s3:buckets
podman-compose run --rm -T tools npm run icd10:import
```

**依存を先に上げるのと `-T` を付けるのは `podman-compose run` の都合**で、`--no-deps` を付けても依存
container が要り、TTY が無いと container の作成そのものが落ちる。`/healthz` が 200 を返せば依存サービスに
届いている。1 つでも落ちていれば 503 になる。

## 更新

```bash
git pull
scripts/deploy.sh                     # tag を省くと checkout している commit
```

`scripts/deploy.sh` は **image を作り終えてから止める。** 4 つの image を build して tag を付け、DB の
backup を取り、migration を当て、そこまで古い `app` と `proxy` が配信を続ける。最後に `proxy`・`app` の
順に止めて作り直し、`/healthz` が 200 になるまで待つ。止まるのはこの入れ替えの数秒だけで、DB と
ファイルストアは止めない。

- **proxy も毎回作り直す。** 新しい版の静的ファイルを持つのは新しい proxy で、nginx は `app` の
  アドレスを起動のときに 1 度しか引かない
- **`compose*.yml` か `.env` が変わっていると、podman-compose が DB とファイルストアごと作り直す。**
  定義の hash が合わない container を消してから立てるため。データは volume にあるので残る
- **一度きりの container (`run`) が動いている間は流さない** (script も断る)。DB とファイルストアを
  依存に抱えていて、作り直しが途中で落ちる

## 戻す

```bash
scripts/deploy.sh rollback <tag>      # その tag の image に入れ替える。migration は流さない
```

更新のたびに付けた tag の image は残るので、どの版にも入れ替えだけで戻れる。要らなくなった tag は
`podman image rm` で消す。**schema が古い版で動かないときは backup を戻す。** backup の後に書かれたもの
(admin の編集) は失われる。

```bash
podman stop -t 10 <project>_proxy_1 && podman stop -t 2 <project>_app_1
podman exec <project>_db_1 dropdb -U humandbs humandbs
podman exec <project>_db_1 createdb -U humandbs humandbs
podman exec -i <project>_db_1 pg_restore -U humandbs -d humandbs --exit-on-error < <backup>.dump
podman-compose run --rm -T migrate    # 権限を張り直す。手で張るなら tools で npm run db:grants
podman start <project>_app_1 && podman start <project>_proxy_1
```

`<project>` は配置の dir 名。role は DB の外にあるので dump に入らず、database への接続の権限は
作り直した database から消えている。それを `migrate` が張り直す。

## push で作った DB を migration に載せる

`drizzle-kit push` で schema を作った DB には当てた記録が無く、`migrate` は断る。**最初の migration (`drizzle/` の
baseline) と schema が同じことを確かめてから、それを当てた印だけを付ける。** 比べるのは
`scripts/schema-fingerprint.sql` で、列の並び順を除いた schema の形を 1 行ずつ出す。

```bash
podman exec <project>_db_1 createdb -U humandbs humandbs_baseline_check
podman-compose run --rm -T -e HUMANDBS_OWNER_DATABASE_URL=<owner の URL>_baseline_check \
  -e HUMANDBS_DATABASE_URL=<アプリの URL>_baseline_check migrate
for d in humandbs humandbs_baseline_check; do
  podman exec -i <project>_db_1 psql -U humandbs -d $d -At -f - < scripts/schema-fingerprint.sql > $d.shape
done
diff humandbs.shape humandbs_baseline_check.shape && \
  podman-compose run --rm -T migrate npm run db:mark-baseline
podman exec <project>_db_1 dropdb -U humandbs humandbs_baseline_check
```

2 つの URL は `.env` の値の末尾に `_baseline_check` を足したもの。**role と password は `.env` のまま
にする** — role は database の外にあり、`migrate` はアプリの role の password を URL の値に張り直す。
差が出たら印を付けず、差を解消してから比べ直す。**印は記録が 1 件も無い DB にしか付かない。**
podman-compose 1.0.6 の `-e` は値を `=` で切るので、password に `=` を含むときは使えない。

## データを入れる

公開するデータは本番用の移行が作る。旧ポータル (v1 の検索基盤・CMS と、その前の Joomla) の凍結した
snapshot を入力に、DB を空にしてから全部を入れ、そのあと配信ファイルを file store に運ぶ。**入力は image
にも repo にも入らない**ので、`migration/input/l12/` に手で運ぶ。`tools` はこの dir を mount し、移行の
コードは image から読む (直したら `podman-compose build tools`)。画面を開発用データで確かめるだけなら
手元と同じ手順で入る ([development.md](development.md) の「開発用データを入れる」)。

```bash
podman-compose run --rm -T tools npx tsx migration/production.ts
podman-compose run --rm -T \
  -v <旧ポータルの files の dir>:/source/files:ro \
  -v <旧ポータルの public-files の dir>:/source/public-files:ro \
  tools npx tsx migration/carry-files.ts
```

**移行は流すたびに DB を空にしてから入れる。** 規則で割れなかったものを人が直した結果は、DB の上ではなく
`migration/input/l12/hand/` の表に置き、移行がそれを読む。DB を直接直すと、次に流したときに消える。
規則で割れずに残ったものは `migration/input/l12/out/` に書き出される。

**搬入は止めて流し直せる。** file store に同じ大きさで既にあるものは飛ばすので、2 回目は残りだけを運ぶ。
**DB を入れ直したら搬入ももう一度流す。** 非公開の箱は研究の identity で分けていて、入れ直すと identity が
新しくなるため。古い identity の下に残ったものは `out/carry-report.json` の `stray` に並ぶ。

何を運ばないか (同じデータの別の形、後の版に置き換わった版、作業用のファイル、箱の外の資料) と、どれを
非公開の bucket に入れるかは `migration/carry.ts` が決める。箱の中の階層は落とし、ファイル名だけを key に
する ([files.md](files.md) の「2 つの bucket」)。

## 意図的にやっていないこと

- **blue-green の切り替え。** 入れ替えの数秒は止まる。container の名前も proxy の port も 1 組しかない
- **`migrate` を `app` の起動に繋げること。** podman-compose 1.0.6 は完了を待つ依存を持たず、繋ぐと
  終わった container に `app` の起動が縛られる
- **環境ごとに compose を分けること。** 違いは `.env` が持ち、env の template は値の雛形でしかない
- **配置先のアドレスもホスト名も repo に書くこと**
- **アシスタントを既定で立てること** ([development.md](development.md) と同じ)
