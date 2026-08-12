# ファイル

配信するデータファイルと、記事から参照する画像や PDF。**ポータルの中でここだけが Postgres の外に
実体を持ち、公開状態もそちら側にある。**

## 帰属を持たない

**ファイルは upload / download と公開・非公開の切り替えができるストアとして持ち、research・dataset・
document への従属関係をモデルに持たせない。** 本文からの参照は URL 文字列で張られるだけで、その参照
関係を維持する仕組みは持たない。

**どこからも参照されなくなったこと (orphan) を機械的に判定できないので、orphan の検出はしない。**
ファイルは本文中の URL 文字列と下の「選択」からしか参照されず、外部サイトからの直接参照もありうる。
棚卸しが要るときは admin が手で見る。

## 2 つの bucket

**実体は S3 の 2 bucket に置き、公開状態は bucket の在籍そのもの。** Postgres に公開状態を持たない。
bucket を分けるのは **prefix 単位の grant が効かない**ため。公開を表現できるのは anonymous identity への
grant だけで、bucket policy も object ACL も anonymous には効かない。

| bucket | key | 読み手 |
|---|---|---|
| 非公開 | `{researchId}/{ファイル名}` | admin のみ。server 側が presigned URL で渡す |
| 公開 (`files`) | `hum{NNNN}/{ファイル名}` | anonymous。前段の proxy が `/files/` をそのまま渡す |

非公開側が identity なのは、**ファイルの受け入れが hum の pin より前に起きる**ため。公開側が hum なのは、
path-style の URL が `/files/hum0009/hum0009.v1.CpG.v1.zip` となって公開済みの download URL と構造ごと
一致し、anonymous の download に解決を挟まずに済むため。公開操作は CopyObject + DeleteObject で、
**ファイル名は変えない**。hum に属さない記事 asset は `common/` の箱に置き、公開 bucket 固定になる。

守る不変条件:

- **同じ (research, ファイル名) の組が 2 つの bucket に同時に存在しない。** 切り替えは原子的でないので
  途中で落ちると両方に居るが、それは公開状態ではなく未完了で、job の retry が解消する。**job ごと
  失った状態で両方に居るものが見つかったら、公開側を残して非公開側を消す**
- **filer と master と S3 API の port を直接公開しない。** filer の HTTP は完全に無認証で、非公開
  bucket の一覧と本文をそのまま返す。**読み書きとも必ず前段の proxy を通す** — 配信では proxy が付ける
  header を迂回した URL が同じ object に生まれるのを防ぎ、upload では presigned URL の宛先がそもそも
  この site の origin になる。署名は宛先の host を含むので、proxy はそれを変えずに渡す
- **前段で `X-Content-Type-Options: nosniff` を付け、画像と PDF 以外は `Content-Disposition: attachment`
  にする。** ストアは Content-Type 未指定のファイルの中身から MIME を推測するので、HTML を含むファイルが
  同じ origin で inline render される経路を塞ぐ
- **非公開のファイルの byte を、admin 以外に渡す経路を作らない。** 共有リンクの preview は箱の中身を
  名前で見せるが ([editing.md](editing.md) の「レビュー」)、presigned GET は渡さない。渡すには S3 の
  port を公開するかアプリが byte を流すかのどちらかが要り、どちらも前段の proxy を通す規則から外れる

## upload

**upload は presigned URL で行い、byte はアプリを通らない。Content-Type と Content-Length を署名対象に
入れる。** byte がブラウザとストアの間を直接流れる以上、**発行時に決めた種類とサイズちょうどしか受け
付けない URL にすることが、かけられる唯一の制限になる**。違う値を送っても値を送らなくても 403 になる。
有効期間はストアが 7 日を上限として強制する。

- **画面はまず名前とサイズと種類を送り、URL を受け取ってから PUT する。** 署名にサイズと種類が入って
  いるので、送るものが決まる前に URL を出せない
- **64 MiB を超えるものは multipart になる。** part の PUT だけが presigned で、開始と完了は server 側。
  進捗と中断を出し、**ページを閉じた後の再開は持たない** (途中の part は S3 側に残るので、入れ直せば
  同じ名前で上書きされる)
- **upload 直後は非公開。** 提供者から受領した瞬間に匿名で取得できる状態を作らない
- **同じ名前の upload は上書きになる。** 名前が key そのものなので、別物として並べる余地がない

**`common/` の箱だけは公開 bucket 固定**なので、置いた時点で公開される。upload も削除も証跡に残る
([publishing.md](publishing.md) の「証跡」)。

## 切り替えの job

**切り替えのコストはファイルサイズに比例する。** CopyObject は実体のバイトコピーなので、公開状態の
切り替えは job にして公開操作を待たせない。**Postgres が持つのは実行待ちの job だけ** — job を失っても
矛盾は生まれず、ファイルは公開のままか非公開のままかのどちらかに留まる。誰がいつ切り替えたかは
event に残る。

- **1 つのファイルに 1 行しか持たない。** 積むのは (research, ファイル名) を鍵にした upsert で、新しい
  意思が来たら action を上書きする。「あるべき在籍」は常に 1 つで、失敗も同じ行に残る。制約を持たないと、
  同じファイルの中間の意思まで実バイトコピーとして実行される
- **完了は、読んだ action と行の action が一致するときだけ行を消す。** 実行中に意思が変わっていたら
  実行待ちへ戻すので、最後の意思に収束する
- **回すのはアプリのプロセスで、専用の worker を立てない。** byte は S3 の中で流れるのでアプリは待つ
  だけになり、`FOR UPDATE SKIP LOCKED` があればプロセスが複数でも重複しない。再起動で中断したものは
  起動時に実行待ちへ戻す
- **hum ラベルを付け替えたら、公開側の箱の中身を新しい箱へ移す job を積む。** 移さないと公開中の
  ファイルが旧い箱に取り残されて 404 になる。同一 bucket 内なので metadata 操作で終わる

## 一覧と選択

**ダウンロード一覧は content に持たず、箱を list して作る。箱は research に 1 つなので一覧は hum 単位。**
公開ページは公開 bucket だけを、admin の画面は `hum{NNNN}/` と `{researchId}/` を list して名前で合成した
ものを見る。**共有リンクの preview も admin 側の list を見る** — draft の段階では公開 bucket に何も無いので、
公開側だけを見せると提供者への確認で一覧が丸ごと消える。

**dataset は箱の list に対する選択を持てる。** 自分が属する hum の箱の list に現れるノードを順序つきで
0 個以上選ぶ。これが「この dataset のデータはこれ」の注記になり、dataset content の中に入る。

- **選択は存在を主張しない。** 源は箱の list 1 本だけで、list に無いものは表示されない
- **ダウンロード一覧の導出には使わない。** 一覧は箱の機械 list のままで、選択はその上の注記に留まる
- **ファイル側は何も知らない。** 1 ファイルが複数 dataset から選ばれてよい
- **外部アーカイブの dataset には持たせない。** distribution はアーカイブから取る経路のまま。この区別は
  **primary の dataset id の綴り**が決める ([data-model.md](data-model.md) の「identity と label」)

## 画面

**箱の画面は draft の外にある。** 箱は research に 1 つで版も draft も持たず、ファイルの公開は research の
公開とは独立した操作なので、draft の下に置くと「draft を公開したらファイルも公開される」と読める。
research の画面には件数と入口だけを出す。

**公開状態の切り替えと削除は複数選んでまとめて行う。** 切り替えは job なので画面は待たず、実行待ちと
実行中を list の上に出す。**公開実績のあるファイルの削除には確認を挟む** — 外部から直接参照されている
実績があり、参照関係を持たない以上その検査ができない。

**dataset がどのファイルを選ぶかは、dataset の編集画面で決める。** 選んだものを並べ、絞り込みの窓を
持つ picker から足す。**選択は dataset content の一部なので、保存も照合も他の値と同じ**変更エントリ
1 行の単位になる。**draft の段階では公開 bucket が空**なので、選ぶ相手は公開と非公開を合成した
admin 側の list。

**外部アーカイブの dataset には picker を出さない。** ファイル選択を伴う保存も、フォームが提供しない
入力として 400 で弾く ([editing.md](editing.md) の「編集フォーム」)。**まだ id が pin されていない
dataset も外部として扱う** — 判定は primary の綴りで、pin されるまでは綴りが無い。

## 意図的にやっていないこと

| やらないこと | 理由 |
|---|---|
| ファイルの帰属と orphan 検出 | 参照が追いきれない。箱の list と選択の差は orphan レポートではない |
| dataset とファイルの名前規約 | 対応は箱の list に対する選択で持つ |
| upload の再開 | 途中の part はストア側に残る。入れ直せば同じ名前で上書きされる |
| 箱の中にディレクトリを作ること | 名前に `/` を含む upload は 400。移行が作った深い key は一覧に出るが、画面からは足せない |
| ファイル名を全文索引に入れること | 名前の原本が content ではなく箱の側にあるため ([data-model.md](data-model.md) の「検索用の行」) |
