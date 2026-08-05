# データモデル

HumanDBs Backend のデータ構造に関する設計判断。

## ES インデックス

| インデックス | ID 形式 | 用途 |
|------------|--------|------|
| `research` | `{humId}` | 研究メタデータ |
| `research-version` | `{humId}-{version}` | バージョン履歴 |
| `dataset` | `{datasetId}-{version}` | データセット詳細 |

## マッピング設計

TypeScript 型は Zod スキーマから推論し、ES マッピングは `f` ヘルパーで明示的に定義する。

```plaintext
crawler/types/*.ts (Zod スキーマ = 型の源泉)
         ↓ 型推論
TypeScript 型 (Dataset, Research, etc.)

es/*-schema.ts (明示的 ES マッピング)
         ↓ generate-mapping.ts
ES mapping (JSON)
```

### バイリンガルヘルパー

多くのフィールドが日英両方を持つため、`f.bilingualText()` 等のヘルパーで `{ ja, en }` 構造を一括生成する。

### Nested vs Object

- **nested**: 配列要素間で独立したクエリが必要な場合 (例: diseases の label と icd10 の関係を保持)
- **object**: 単純なネストで十分な場合

`nested` は独立したドキュメントとして格納されるため、クエリ時にオーバーヘッドがある。必要な場合のみ使用する。

### 配列フィールド

ES マッピングでは配列を明示的に区別しない。`keyword` フィールドに配列を格納すると、ES が自動的に配列として処理する。配列かどうかは `src/crawler/types/structured.ts` の Zod スキーマを参照すること。

### catch-all field (`all_text`)

`research` / `dataset` の各 index は root に `all_text`（text 型）を持つ。自然文テキストと facet keyword は helper に catch-all 名を渡して（`generate-mapping.ts` の `CATCH_ALL_FIELD = "all_text"`、`f.text(C)` / `f.bilingualTextValue(C)` 等）`copy_to: all_text` を付与し、index 時に値を `all_text` へミラーする。フリーテキスト検索はこの単一フィールドへの `match` でドキュメント全体（nested 配下を含む）を全文検索する（`api/es-client/query-builders.ts`）。

- `dynamic: false` のため `all_text` 自身も明示宣言が必要（`*-schema.ts` の root に `all_text: f.text()`）
- `all_text` を含む全 text フィールドは index 既定 analyzer（kuromoji 形態素解析。`src/es/analysis.ts` の `INDEX_ANALYSIS_SETTINGS`、index 作成時に `settings.analysis` として付与）でトークナイズされる。日本語は語境界で分割、英語は小文字化される。analyzer は field 作成時に固定されるため、変更時は index 再作成 + 全再 ingest が必要
- `all_text` は `copy_to` のターゲットで `_source` には現れない write-time フィールド。Zod schema にも持たないため、`schema-consistency` テストでは Zod 比較から除外する
- 集約対象は自然文テキスト全般 + facet keyword。ID / コード / 数値 / boolean / URL は除外（ID は term / prefix 経路で扱う）
- `experiments.data`（`flattened`）は ES 仕様上 `copy_to` のソースにできず、`all_text` に含まれない

## 型の変換フロー

データは Crawler → ES → API → Frontend の 4 層を通過し、各層で型が変換される。

```plaintext
Crawler (structured.ts)  →  ES (es/types.ts)  →  API (api/types/)  →  Frontend (shared-types.ts)
```

- **Crawler → ES**: `es/types.ts` は crawler スキーマを `.extend()` で合成し、差分のみ定義する
  - `EsDatasetSchema`: `originalMetadata` を `.extend()` で追加
  - `EsResearchSchema`: `status`, `uids`, `draftVersion`, `summaryShort` を `.extend()` で追加
  - `ResearchVersionSchema` (ES 側): `CrawlerResearchVersionSchema` を `.extend()` して per-version content snapshot 7 フィールド (`title` / `summary` / `summaryShort` / `dataProvider` / `researchProject` / `grant` / `relatedPublication`) を追加。詳細は下の「Research と ResearchVersion のフィールド分担」節を参照
  - `summaryShort`: 一覧表示用の 1〜2 文の短文要約（`methods` / `typeOfData` / `targets` の 3 つ、各 `BilingualTextValue`）。Joomla 旧サイトの一覧 article（ja=`/home`, en=`/en/home`）由来。crawler を経由しないため `nullable + optional`。未掲載 humId は null。他の content フィールドと同じく ResearchVersion が SSOT で、curator による編集は `PUT /research/{humId}/update` の `summaryShort` フィールド経由（`null` を送ると Joomla 一覧から外れたケースを表現）
  - Crawler の `latestVersion` は `z.string()` だが、ES では nullable（未公開時 null）
  - `draftVersion`: 編集中のバージョン（null = 編集なし）。ES 固有フィールド
  - `.describe()` は crawler スキーマ（SSOT）に定義されているため、ES スキーマが継承する
- **ES → API**: `api/types/es-docs.ts` で re-export。`api/types/views.ts` で API ビューモデル（`ResearchDetail`, `MergedSearchable` 等）を定義
  - `DatasetDocWithMergedSchema` は `EsDatasetSchema` を `.extend()` して `mergedSearchable` / `distribution` / `parentJgaStudyId` を追加する。これらは ES に保存されないレスポンス時のみの拡張フィールド（`parentJgaStudyId` は DDBJ Search から live 取得。詳細は [api-guide.md § 10](api-guide.md#10-dataset-レスポンスの動的生成フィールド)）
  - API リクエスト用スキーマでは、コンテキストに応じてフィールドを選択的に除外する（`request-response.ts`）:
    - `dataProvider`: `datasetIds`, `researchTitle`, `periodOfDataUse` を除外
    - `controlledAccessUser`: 全フィールドを含む
    - `relatedPublication`: 全フィールドを含む（`datasetIds` で論文とデータセットを紐付け）
  - Create/Update リクエストは `api/types/request-schemas.ts` の `*RequestSchema` 系を使用。`TextValue` 系フィールドから `rawHtml` を除外する（`{ text: string }` のみ）。ES 書き込み時に `api/utils/hydrate-raw-html.ts` の hydrator が `rawHtml: null` を注入する
  - `TextValueSchema.rawHtml` は `z.string().nullable()`
- **API → Frontend**: `types/shared-types.ts` で clean name（`Es` prefix なし）のみを re-export

依存の方向: `crawler/types → es/types → api/types/` を維持すること。

## Research と ResearchVersion のフィールド分担

Research の content 系フィールドは **ResearchVersion 側を SSOT** として per-version の snapshot を持つ。Research root は `latestVersion` の snapshot として同じフィールドを保持し、search / listing / `all_text` のバッキングを兼ねる。

### 対象フィールド

| フィールド | 保存場所 | 備考 |
|---|---|---|
| `title` / `summary` / `summaryShort` / `dataProvider` / `researchProject` / `grant` / `relatedPublication` | 両方 (RV が SSOT、root は latestVersion snapshot) | draft 編集は RV[draftVersion] のみに書く。approve / patch で root と同期する |
| `controlledAccessUser` | Research root のみ | CAU pipeline (`src/cau/`) が版横断で累積する |
| `humId` / `url` / `versionIds` / `latestVersion` / `draftVersion` / `datePublished` / `dateModified` / `status` | Research root のみ | メタデータ |
| `humVersionId` / `version` / `versionReleaseDate` / `datasets` / `releaseNote` | ResearchVersion のみ | 版メタデータ |

### 書き分けルール (`updateResearch` at `src/api/es-client/research.ts`)

編集がどの版に着地するかは 1 つの式で決まる。`resolveEditTargetVersion` (`src/api/utils/version.ts`) が返す `draftVersion ?? latestVersion` — 進行中の draft があればそこ、無ければ公開版 (in-place patch) である。content フィールド、release note、dataset の link / unlink、`POST /research/{humId}/dataset/new` が作る Dataset の `humVersionId` がすべてこの式を通るので、1 回の編集が別々の版に散ることがない。

Research root に content を mirror するのは、着地先が `latestVersion` そのものだったとき (= in-place patch) だけ。

| Action | Research root content | RV content | RV write target |
|---|---|---|---|
| create (N-new draft) | 書く (creation 時のみ) | RV v1 に書く (root と同じ値) | v1 |
| update draft, `latestVersion=null` (N-new-hum draft) | 書かない | 書く | draftVersion |
| update draft, `latestVersion!=null` (V-new-version draft) | **書かない** ← 漏れ防止の核 | 書く | draftVersion |
| update published (in-place patch) | 書く | 書く (root と同じ値) | latestVersion |
| versions/new | 変更なし | 新 RV に RV[latestVersion] の content を copy | 新 version |
| approve | RV[新 latestVersion] の content を root に copy | 変更なし | - |
| submit / reject / unpublish | 変更なし | 変更なし | - |

`versions/new` が copy 元にするのは `latestVersion` が名指す RV であって、版番号が最大の RV ではない。移行データには `latestVersion` より上の番号を持つ孤立 RV があり、そこには公開されたことのない content が入っている。番号最大の RV から copy すると、その content が次の approve で公開される。

approve が呼ぶ `syncResearchRootFromVersion(humId, version)` は idempotent。RV 側の content フィールドが null (pre-migration doc) の場合はそのフィールドの copy をスキップし、root の既存値を残す。

`summaryShort` だけは `null` の意味が違う。他の content フィールドの `null` が「pre-migration で未装填」を表すのに対し、`summaryShort` の `null` は「Joomla 一覧から外れた」を表す正当な値である (`PUT /research/{humId}/update` は「`null` = クリア、フィールド省略 = 据え置き」と定めている)。そのため copy をスキップする条件はフィールドが存在しないときだけで、`null` はそのまま root へ伝える。新版への content 引き継ぎ (`versions/new`) と詳細レスポンスの overlay も同じ規則に従う。

### 読み分けルール (`getResearchDetail` at `src/api/es-client/research.ts`)

- version 解決後の RV[resolvedVersion] doc から content を優先して取得
- RV の content が null (migration 途中の pre-existing doc) の場合は Research root にフォールバック
- search / listing (`searchResearches`) は Research root を読む (= public snapshot と一致)

### migration

content フィールドを per-version 化したとき、既存の RV doc には content が入っていない。移行では ES mapping にフィールドを additive に追加し (`PUT /research-version/_mapping`、既存 doc は触らない)、Research root の値を全 version に backfill する。initial backfill では全 version が同じ content (= 現行 latestVersion の content) になる — 過去バージョンの historical content は復元できないが、以降の編集からは per-version に分岐する。

## 日付フィールド

公開日 / 更新日を名乗るフィールドは 6 つあるが、一次情報は `ResearchVersion.versionReleaseDate` と `Dataset.releaseDate` の 2 つだけで、残りはそこから導出する。

| フィールド | 定義 |
|---|---|
| `ResearchVersion.versionReleaseDate` | **その版を公開した日** (approve した日)。公開済みの版では必須 |
| `Dataset.releaseDate` | **その Dataset 自体が公開された日**。外部 DB (DDBJ Search の `datePublished`) の値。取得できない場合はその Dataset が初めて載った版の `versionReleaseDate` |
| `Research.datePublished` | `min(公開版の versionReleaseDate)` = 初版の公開日 |
| `Research.dateModified` | `max(公開版の versionReleaseDate)` = 最新版の公開日 |
| `Dataset.versionReleaseDate` | その Dataset 版が生まれた ResearchVersion (= `humVersionId`) の `versionReleaseDate` の写し |
| `Dataset.dateModified` | `max(公開版の versionReleaseDate, releaseDate)` を同じ datasetId の全版に複製 |

導出に使うのは **公開済みの版だけ** である。`draftVersion` が名指す版と、`latestVersion` より上の番号を持つ孤立 RV は、いずれも公開されていないので min / max のどちらにも入れない。draft の日付が公開側の表示・ソート・フィルタに現れることは、未公開の版の存在を漏らすことを意味する。

`Research.datePublished` / `dateModified` は導出値であり、内容の編集そのものでは動かない。「最後に編集した日」ではなく「最新版を公開した日」なので、in-place patch で誤字を直しても更新日は変わらない。値が動くのは版の公開状態が変わったとき — approve と unpublish — に限られる。

`Dataset.dateModified` が `releaseDate` も max の候補に取るのは、DDBJ 側の公開が版の公開より遅れると更新日が公開日より前になるためである。同じ datasetId の全版に同じ値を複製するのは、listing が `collapse` で 1 版だけを選ぶため、選ばれた版によってソート順が変わらないようにするもの (`es/dataset-schema.ts`)。

`Dataset.releaseDate` は datasetId 単位で一定であることを意図しているが、移行データには版ごとに違う値を持つものがある。

`Dataset.humVersionId` はその Dataset 版を生んだ ResearchVersion — 作成した版、または内容を変えて版を上げた版 — を指す。ResearchVersion の `datasets` は内容が変わらない Dataset 版への参照を次の版へ引き継ぐので、1 つの Dataset 版が複数の ResearchVersion から参照されることがあるが、`humVersionId` はそのうち最初の 1 つだけを指し、後から参照されても動かない。`versionReleaseDate` がこれに従うことで、内容が変わっていない Dataset の更新日が、親の版が上がっただけで動くことはない。移行データにはこの規則から外れ、最後に参照した版を指しているものがある。

### 公開状態が変わったときの再計算

approve は版の公開日を確定させ、そこから導出される値を順に揃える。

1. `RV[draftVersion].versionReleaseDate` に当日の日付を書く
2. `humVersionId` がその RV を指す Dataset の `versionReleaseDate` を 1 の値に揃える。この版で生まれた Dataset だけが対象で、前の版から参照を引き継いだだけのものは触らない
3. その Research 配下の**全** datasetId の `dateModified` と最新版フラグを計算し直す。2 で触ったものだけでは足りない — 公開の天井が上がると、この版で生まれていない Dataset 版まで公開集合に入ることがある
4. `Research.datePublished` / `dateModified` を公開版の min / max で計算し直す

unpublish は公開版がゼロになるので、3 の最新版フラグと 4 を行う。`dateModified` は公開版が無いと導出できないので直前の値を据え置く。`versions/new` と各種 update は公開状態を変えないため、どちらにも触らない。

draft 中の `versionReleaseDate` は approve までの暫定値である。値そのものに意味はないが、公開版で必須である以上 null のまま approve に到達させないために、版の作成時に当日の日付を入れておく。

## 最新版フラグ

Dataset の検索・集約は datasetId ごとの最新版だけを見る ([architecture.md § Dataset の検索・集約は最新版のみ](architecture.md#dataset-の検索集約は最新版のみ))。どれが最新版かはクエリ時には決められない — Elasticsearch の `collapse` は集約に効かず、doc 間でフィールドを比較する手段も無い — ので、doc 自身に持たせる。

| フィールド | 定義 |
|---|---|
| `Dataset.isLatest` | 同じ datasetId の doc のうち version 番号が最大。親 Research を参照しない |
| `Dataset.isLatestPublished` | 親 Research の `latestVersion` を天井として公開版だけを残した集合で version 番号が最大 |

2 本あるのは「最新版」が閲覧者によって違うためである。public と非オーナーは公開版の最新 (`isLatestPublished`)、オーナーと admin は draft を含む最新 (`isLatest`) を見る。公開集合の選び方は `Dataset.dateModified` と共通で、どちらも `isHumVersionAccessible` (`src/api/utils/version.ts`) を通す — 導出値はすべて公開済みの版だけから作る、という同じ原則に従う。

doc 集合が空でなければ `isLatest` が true の doc はちょうど 1 件、`isLatestPublished` が true の doc は 0 件または 1 件で、後者の version は前者以下になる。公開版が 1 つも無い datasetId (親が未公開、または全 doc が `latestVersion` より上の孤立 doc) では `isLatestPublished` が全件 false になり、その Dataset は public の検索から消える。

計算は `src/es/dataset-latest.ts` の純関数が持ち、ingest (`es/load-docs.ts`) と live (`es-client/publish-dates.ts § syncDatasetDerived`) と backfill (`scripts/backfill-dataset-latest.ts`) の 3 経路が同じ定義を共有する。

既存 index にこの種の denormalize フィールドを足すときは、mapping を additive に追加してから値を書く。ES index は `dynamic: false` なので、mapping が無いまま書いた値は `_source` に入るだけで index されず、後から mapping を足しても遡及しない。
