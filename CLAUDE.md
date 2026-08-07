# HumanDBs

NBDC ヒトデータベース (https://humandbs.dbcls.jp) のポータル。SSR する単一の React Router アプリで、
loader / action から直接 Postgres を読む。全文検索と facet も同じ Postgres で完結し、データファイルは
S3 (SeaweedFS) の 2 bucket に置く。

## docs が SSOT

仕様が絡む変更は `docs/` を先に直してから実装する。索引は [README.md](README.md)。

| 知りたいこと | どこ |
|---|---|
| 何をどう持つか (identity と label、版と pin、公開表現、ファイル、キャッシュ) | [docs/data-model.md](docs/data-model.md) |
| 編集から公開まで (draft、保存の単位、同時編集、公開ゲート、レビュー、証跡) | [docs/editing.md](docs/editing.md) |
| 誰が何を許されるか (capability、セッション) | [docs/auth.md](docs/auth.md) |
| test の階層と mock の境界 | [docs/testing.md](docs/testing.md) |
| 開発環境の手順 | [docs/development.md](docs/development.md) |
| 訳語 | [docs/glossary.md](docs/glossary.md) |

型の SSOT はコード側にある — schema は `app/db/schema/`、content の型は `app/content/types.ts`。
doc に一覧を写さない。

## 開発コマンド

**すべて container の中で実行する。** `node_modules` が named volume にあるので、ホストの Node で
`npm` を直接叩くと状態が食い違う。

```bash
docker compose exec app npm run lint         # eslint (整形も eslint が持つ。lint:fix で直す)
docker compose exec app npm run typecheck
docker compose exec app npm run test         # 全階層
docker compose exec app npm run test:unit    # 不変量 + 単体 (DB 不要)
docker compose exec app npm run test:db      # schema + 経路 (db が要る)
docker compose exec app npm run db:push      # schema 定義を DB に反映
```

## 守ること

**mock の境界。** mock してよいのは v2 の外側だけ — Keycloak / S3 / DDBJ Search / JGA 申請管理
システム DB / 時刻・乱数。**Postgres は mock しない。** 設計の中心が schema の制約と検索行の導出に
あるので、DB を mock すると捕まえたい失敗がそのまま test の外に出る。**内部の関数・module・
component・loader / action も mock しない。** 内部の mock が要るように見えるときは、test ではなく
設計を直す。

**test は「通るだけ」を書かない。** 正常系をなぞるだけのものは、境界値・異常系・否定形を足せない
なら書かない。階層はファイル名で分ける (`*.pbt.test.ts` = 不変量、`*.db.test.ts` = schema と経路、
`*.test.ts` = 単体)。**docs に「守る」と書いた不変条件は必ず 1 つ以上の test を持ち、test 名は
その不変条件の文そのものにする。**

**e2e は開発中に回さない。** 実行が分単位なので、deploy 済みの実物に対してリリース判定の前に回す。

**schema が固まるまで migration file を持たない。** 定義を変えたら `db:push` して開発用データを
入れ直す。

**作業経緯を成果物に持ち込まない。** コード中のコメント・test 名・docs・commit message に
「以前は X だった」「phase 1 より」の類を書かない。コードベースは現在の意図だけを語る。

## 触ってはいけないもの

- production 環境 (ES / CMS DB / JGA DB)。検証は staging で行う
- JGA 申請管理 DB (jga-shinsei) は他プロジェクト所管。schema 変更 / 直接書き込みをしない
