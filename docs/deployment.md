# 配信する

`compose.deploy.yml` を開発の compose に重ねて、dev サーバーではなく build したものを serve する。
**配置先ごとに違う値は `.env` だけが持つ**ので、repo にはアドレスも環境の名前も入らない。DB・ファイル
ストア・上流の扱いそのものは [development.md](development.md) と同じ。

配信先は rootless podman なので、コマンドは `podman-compose` で書く。`compose.deploy.yml` が
`userns_mode` を持つのはそのためで、bind mount した source を image の中の `node` が書けるように
呼び出したユーザーを重ねている。

## dev サーバーを配信に使わない

設定の付け足しでは埋まらない差が 3 つあるので、配信するのは build したものに限る。

- **vite は Host を見て、知らないホスト名の要求を弾く**
- **`react-router-serve` は `NODE_ENV` を見て、production でなければ例外の stack trace を返す**
- **部品カタログ (`/dev/ui`) は build したものにだけ入らない。** route の登録が build 時の `NODE_ENV`
  で分かれる ([development.md](development.md) の「部品を見る」)

**serve する port は dev サーバーと同じ。** proxy の設定を環境ごとに分けないため、`app` の待ち受けは
どちらでも 1 つの値で、nginx の設定は 1 つしかない。

## image を焼き直さない

source は bind mount のままで、`node_modules` は named volume。**更新は `git pull` と restart で終わり**、
image の build は要らない。裏返しに 2 つの帰結がある。

- **`package-lock.json` が変わった更新は install を伴う。** `NODE_ENV=production` なので
  `npm ci --include=dev` でないと開発依存が入らず、build も schema の操作もできなくなる
- **schema・辞書・admin の操作は配信している container の中でそのまま打てる。** `drizzle-kit` も `tsx` も
  開発依存で、それが入ったままだから

## `.env` が決めること

[`.env.example`](../.env.example) を写して書き換える。配信で意味が変わるのは次の 5 つ。

| 変数 | 配信での意味 |
|---|---|
| `HUMANDBS_AUTH_REDIRECT_URI` | **サイトの origin がこの 1 行から導かれる。** presigned URL の宛先も cookie の `Secure` もここで決まるので、外から実際に見えるアドレスを書く |
| `HUMANDBS_PUBLIC_BIND_HOST` | 別のホストから届く配置では `0.0.0.0`。既定の loopback は手元のためのもの |
| `HUMANDBS_PUBLIC_PORT` | proxy が待つ port |
| `HUMANDBS_JGA_DATABASE_URL` | 踏み台の内側からは直接届くので、手元と違って埋める |
| `HUMANDBS_S3_ACCESS_KEY` / `HUMANDBS_S3_SECRET_KEY` | ファイルストアの鍵。**`.env.example` のまま使わない** (下の節) |

**redirect URI は Keycloak の client 側にも登録されていないといけない。** 登録が無いと認可要求が
`400 Invalid parameter: redirect_uri` で落ち、サインインだけが通らない状態になる (公開ページは出る)。
新しいアドレスを立てるときは、これを先に頼む。

## ファイルストアの鍵を作り直す

`/private/` は proxy が外に開いていて、そこに置いたものを読めるかどうかは **URL に付いた署名だけ**で
決まる。署名する鍵は `.env` の 2 行なので、**`.env.example` の値のまま配信すると、それを読んだ人が
誰でも非公開 bucket の署名を作れる。**

同じ鍵をアプリ (署名する側) と store (検証する側) の両方が使うので、片方だけ変えると upload も配信も
403 になる。store は**起動時にしか読まない**ので、変えたら `podman-compose up -d s3`。

## 初回

```bash
git clone -b v2 <repo> <dir>
cd <dir>
cp .env.example .env                  # 上の表に従って書き換える
ln -s compose.deploy.yml compose.override.yml
mkdir node_modules
podman-compose up -d db s3
podman-compose run --rm -T app npm ci --include=dev
podman-compose up -d db s3 app proxy
podman-compose exec app npm run db:push
podman-compose exec app npm run s3:buckets
podman-compose exec app npm run icd10:import
```

install を先に済ませるのは、`app` の command が build から始まるため。**`node_modules` の dir を先に
作るのは**、bind mount した source の上に named volume を重ねるので、mount 先が無いと container が
作れないから。**依存を先に上げるのと `-T` を付けるのは `podman-compose run` の都合**で、`--no-deps` を
付けても依存 container が要り、TTY が無いと container の作成そのものが落ちる。**service を並べるのも
同じ都合**で、profile の後ろにいるアシスタントまで立てようとする。

`/healthz` が 200 を返せば依存サービスに届いている。1 つでも落ちていれば 503 になる。

## 更新

```bash
git pull
podman-compose restart app
```

service を並べるのは `up -d` のときだけで、`restart` は動いているものだけを見る。

**定義を変えたときは `down` を挟む。** `up -d` は既にある container を作り直さず、名前が使われていると
start に落ちるだけなので、変えたはずの設定が入らないまま動き続ける。

restart で build し直して serve し直すので、frontend だけの変更ならこれで終わり。それ以外が絡むときは
下記を足す。

| 変わったもの | 追加ですること |
|---|---|
| `package-lock.json` | 先に `podman-compose run --rm -T app npm ci --include=dev` |
| schema | `podman-compose exec app npm run db:push` |
| `compose*.yml` / `.env` | `podman-compose down` してから `up -d` |
| `docker/nginx/default.conf` | `podman-compose restart proxy` (bind mount なので `up -d` では変わらない) |

## データを入れる

公開するデータは移行が作る。それが出来るまでの間に画面を実データで確かめたいなら、開発用データを
手元と同じ手順で入れられる ([development.md](development.md) の「開発用データを入れる」)。**入力は
image にも repo にも入らない**ので、`migration/input/` に手で運ぶ。

## 意図的にやっていないこと

- **更新のたびに image を焼かない**
- **環境ごとに compose を分けない。** 違いは `.env` が持ち、`compose.deploy.yml` は 1 つしかない
- **配置先のアドレスもホスト名も repo に書かない**
- **アシスタントを既定で立てない** ([development.md](development.md) と同じ)
