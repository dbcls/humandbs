# HumanDBs Backend

## 2025/10/09

- crawler の refactoring を行わなければならない
- 対応済みの humId の list を作る
- molData の中を rawHtml にする

## 2025/08/07

**API Server を使いたい人はこれのみを見てください。**

Joomla! の HTML を parse して、Elasticsearch に読み込ませる。

```bash
# Container の中
root@e7e83a1678b7:/app/apps/backend# bun run crawler -- -p detail
root@e7e83a1678b7:/app/apps/backend# bun run crawler -- -p elasticsearch
# crawler の結果が `./crawler-results` 内に生成される

# curl -X DELETE "http://humandbs-elasticsearch-dev:9200/research,research-version,dataset"
root@0272ff98f17e:/app/apps/backend# bun run es:load-mappings
root@0272ff98f17e:/app/apps/backend# bun run es:load-docs
# Elasticsearch にデータが読み込まれる

root@0272ff98f17e:/app/apps/backend# bun run dev
# API Server が起動する
```

OpenAPI 仕様は、`localhost:8080/docs` で確認できる。

## Ollama model の用意

```
docker compose -f compose.dev.yml exec ollama ollama pull qwen3:8b
```

## 2025/07/17

- ともかく、現状を書いて push して、frontend 側に伝える
- 作るもの
  - Shin-schema
    - 大体 done
    - update と schema の version 管理をどのようにするか
    - 参考にした schema として
      - <https://github.com/ddbj/ddbj-search-converter/blob/main/ddbj_search_converter/schema.py>
      - <https://github.com/ddbj/ddbj-record-specifications/blob/main/ddbj_record_validator/schema_v2.py>
      - <https://github.com/ddbj/pub/tree/master/docs/jga/xsd/1-2>
  - crawler
    - Joomla! (正確には internet 上の htmls) から情報を取得して、Shin-schema に沿う data を生成する
    - 実装は大体 done
    - policy page の構造が混沌としていて、手を入れなければならない
    - 実装は、[`./src/crawler`](./src/crawler) 以下
      - 様々な html に対応するという理由からグルーコードが多い
      - リファクタリング・構造化しても良いが、Joomla! を使わなくなった時点 (data を全て吸い出したと判断できた時点) で役目を終えるので、リファクタ欲を耐えた方が良さそう
  - converter
    - 申請システム DB から情報を取得して、JGA XMLs や DRA の情報と merge しつつ、Shin-schema に沿う data を生成する
    - 遺伝研スパコンでしか動かないはず
    - 実装は not yet
  - api server
    - 断片しか書いていなかった。要 update
    - まず、大まかな GET method を書き、front とちゃんと連携する

---

ともかく、crawler 由来の data 入りの es を用意して、api から情報を取得するには

```
# Container の中
# ./crawler-results 内に中間 file などが生成される
root@e7e83a1678b7:/app/apps/backend# bun run crawler -- -p detail
root@e7e83a1678b7:/app/apps/backend# bun run crawler -- -p elasticsearch
root@0272ff98f17e:/app/apps/backend# bun run es:loadMappings
$ node src/es/loadMappings.ts
Index research created successfully
Index research-version already exists
Index dataset already exists
root@0272ff98f17e:/app/apps/backend# bun run es:loadDocs
$ node src/es/loadDocs.ts
Successfully indexed 670 documents into research
Successfully indexed 986 documents into research-version
Successfully indexed 1734 documents into dataset

root@0272ff98f17e:/app/apps/backend# bun run dev        
$ bun run src/app.ts
Server is running on http://0.0.0.0:8080


$ curl localhost:8080/research/hum0012-en
$ curl localhost:8080/research-version/hum0012-v1-en
$ curl localhost:8080/dataset/JGAD000012-1-en
```

## Crawler memo

- すみません。実装を忘れないための個人的なメモです
- `crawler -p detail`
  - 1. table page から、humId 一覧とを取得してくる
    - この時点で MRI 関係・健康調査系の humId は filter される
  - 2. humId の latest version を取得しつつ、humId と versions の matrix である humVersionId の list を得る
  - 3. それぞれの humVersionId * lang を 1 entry として、crawl する
    - 結果は一つの json file となる
    - 3.1. detail page の html parse 部分 (`detail-parser.ts`)
      - 一番混沌としていて、ほとんどさわれない
      - 頑張った結果、情報量は落とさずに parse 出来ているはず
      - 情報量が落ちてないならば整形は、後の処理に任せようとなったはず
    - 3.2. normalizeMolDataHeader (`normalizeHeader.ts`)
      - `./src/crawler/header.tsv` を下に、MolData の key を寄せる処理
    - 3.3. normalizer (`normalizer.ts`)
      - text の流石におかしい部分を修正している
      - もっと update 出来るはずだがキリのなさも感じていた
      - es insert 直前に追加で行うようにしたほうがコスト的に良さそう
    - 3.4. releasePage
      - 各 release page の情報を取得してくる (e.g., releaseDate)
- `crawler -p elasticsearch`
  - detail json の結果を、elasticsearch bulk insert 用の構造に変換する
  - シン schema になる
  - molData table の構造化などはここでおこなう
    - table を分割したり裏返す処理はだいたい終わったが、適切な datasetId 付けに手間取っている
    - 多分、more discussion が必要

## Crawler 残件

- MRI 関係・健康調査系の html
  - parse が実質的に無理
    - 手作業が必要だと思われる
  - "hum0031", "hum0043", "hum0235", "hum0250", "hum0395", "hum0396", "hum0397", "hum0398"
- 本当に情報が過不足なく吸い出せているかを確認するためのスクリプト
- Policy Page
  - 多くのものは <https://humandbs.dbcls.jp/nbdc-policy>
  - 時々、これ以外の Page の場合がある。。。
- 元の html の構造が変わったときが本当に辛すぎる

---

これより下の情報は、薄い もしくは deprecated な感じかもしれない

## Crawler

`./crawler-results` に、各 crawler の結果が出力される。

現状、mode として、`"elasticsearch" | "detail" | "summary"` がある。

- `elasticsearch`: elasticsearch に insert するための json
- `detail`: 各 html (humIdVersion 単位) ごとの parse 結果の json
- `summary`: 各 field ごとなどの summary files

まず、html file が fetch されて、detail json が生成され、それを元に elasticsearch json や summary json が生成される。  
html が既に存在する場合、cache として、それが使われる。
もし、cache を無視する場合は、`--no-cache` オプションをつける。

```bash
bun run crawler --process detail
bun run crawler --process summary
bun run crawler --process elasticsearch
```
