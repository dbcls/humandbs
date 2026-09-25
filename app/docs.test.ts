import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The shape `docs/` has to keep so that a newcomer can read all of it.
 *
 * The docs hold invariants, boundaries, contracts, procedures and non-goals.
 * What the code can show by itself — sizes, lists of screens, how a thing came
 * to be — grows with every change, and a set of files nobody can read end to
 * end tells nobody anything. These limits are what stop that growth.
 *
 * The docs are also written one way: no bold, one line per paragraph and per
 * list item, and plain words instead of coined ones. A reader who meets a
 * second way of writing, or a word that means something only inside this
 * repo, has to stop and work out whether it means something new.
 */

const ROOT = join(import.meta.dirname, "..")
const DOCS = join(ROOT, "docs")

const MAX_LINES_PER_FILE = 300
const MAX_LINES_TOTAL = 2000

/**
 * Words that mark something the docs do not hold: a measurement or a pixel
 * size (the code and the rule tests own those), history, and what is not
 * decided yet.
 */
const FORBIDDEN: readonly [string, RegExp][] = [
  ["px の値", /\d(?:\.\d+)?\s*px\b/],
  ["以前は", /以前は/],
  ["実測", /実測/],
  ["TODO", /TODO/],
  ["未定", /未定/],
  ["暫定", /暫定/],
]

/**
 * Coined words and metaphors, each with the ordinary compounds that contain
 * the same characters and stay allowed. The comment names the plain word to
 * write instead. The list follows the words the screens and the code use: a
 * reader meets a docs word again on the screen or in the code, or not at all.
 */
const COINED: readonly { word: string, pattern: RegExp, allowed?: readonly string[] }[] = [
  { word: "版", pattern: /版/, allowed: ["出版"] }, // バージョン
  { word: "箱", pattern: /箱/ }, // 研究ごとの prefix
  { word: "研究のフォルダ", pattern: /フォルダ/ }, // 研究ごとの prefix
  { word: "記述", pattern: /記述/, allowed: ["自由記述"] }, // 研究の内容 / データセットの内容
  { word: "主の ID", pattern: /主(?:の|でない|に[しす])/, allowed: ["持ち主"] }, // primary の ID / secondary の ID
  { word: "印", pattern: /印/, allowed: ["矢印", "印刷"] }, // バッジ / アイコン / ボタン
  { word: "札", pattern: /札/ }, // バッジ / アイコン / ボタン
  { word: "帯", pattern: /帯/, allowed: ["色帯", "時間帯", "帯域", "携帯"] }, // 見出しの色帯 / 通知のバナー
  { word: "面", pattern: /面/, allowed: ["画面", "文面", "表面", "場面", "書面", "側面", "当面", "全面"] }, // 画面 / ダイアログ
  { word: "器", pattern: /器/, allowed: ["機器"] }, // rewrite the sentence
  { word: "骨格", pattern: /骨格/ }, // route と部品
  { word: "源", pattern: /源/, allowed: ["情報源", "資源", "電源"] }, // 取り込み元 / 取得元
  { word: "姿", pattern: /姿/ }, // 見た目 / 表示
  { word: "道", pattern: /道/, allowed: ["都道府県", "北海道"] }, // 経路 / リンク
  { word: "綴り", pattern: /綴/ }, // 文字列 / 表記
  { word: "写し", pattern: /写[しすさせ]/ }, // コピー
  { word: "台帳", pattern: /台帳/ }, // ID の割り当て表
  { word: "区画", pattern: /区画/ }, // 画面上部の欄 / 部分
  { word: "道具の行", pattern: /(?:道具|ツール|名前|足元)の行/ }, // ツールバー / 見出しの行 / フッタ
  { word: "段", pattern: /段/, allowed: ["段落", "段階", "前段", "手段", "普段"] }, // stepper / 階層 / 要素
  { word: "枠", pattern: /枠/, allowed: ["枠線"] }, // カード / 欄
  { word: "窓", pattern: /窓/, allowed: ["検索窓"] }, // 入力欄 / キーワード欄
  { word: "軸", pattern: /軸/ }, // 絞り込みの項目
  { word: "約束", pattern: /約束/ }, // 保証 / 仕様
  { word: "効く", pattern: /効[かきくけい]/, allowed: ["有効", "無効"] }, // 反映される / 適用される
  { word: "届く", pattern: /届/, allowed: ["届け出"] }, // 接続できる / 送られる / 反映される
  { word: "断る", pattern: /断[らりるれろっ]/, allowed: ["判断", "中断", "診断", "切断"] }, // 拒否する / エラーにする
  { word: "撥ねる", pattern: /撥ね|弾[かきくけい]/ }, // 拒否する / エラーにする
  { word: "運ぶ", pattern: /運[ばびぶべぼん]|搬入/ }, // コピーする / アップロードする
  { word: "割る", pattern: /割[らりるれろっ]/, allowed: ["割り当て", "割り振"] }, // 分ける
  { word: "畳む", pattern: /畳[まみむめもん]/ }, // 折りたたむ / まとめる
  { word: "落とす", pattern: /落[とち]/, allowed: ["テストが落ち", "段落", "見落と"] }, // 除く / 削除する
  { word: "置き場", pattern: /置き場/ }, // アップロード先 / 保存先
  { word: "打ち込む", pattern: /打ち込|打ち間違/ }, // 入力する / 入力の誤り
  { word: "出し直す", pattern: /出し直|出ていた|今出ている/ }, // 再公開する / 公開していた
  { word: "入口", pattern: /入り?口|編集口/ }, // ボタン / リンク / route
  { word: "答え", pattern: /答え/ }, // メッセージ / 操作結果
  { word: "持ち方", pattern: /持ち方/ }, // 保存形式
  { word: "材料", pattern: /材料/ }, // 元データ / 確認結果
  { word: "欠け", pattern: /欠け/ }, // 不足 / 未入力
  { word: "焼く", pattern: /焼/ }, // 含める / 埋め込む
  { word: "立つ", pattern: /立[たちつてっ]/, allowed: ["組み立", "成り立", "役立", "目立"] }, // 表示される / 設定する
  { word: "倒れる", pattern: /倒れ/ }, // フォールバックする
  { word: "名乗る", pattern: /名乗/ }, // 表示する
  { word: "名指す", pattern: /名指/ }, // 指定する
  { word: "黙って", pattern: /黙/ }, // 警告なしに
  { word: "公開ゲート", pattern: /公開ゲート/ }, // 公開前の確認
]

/**
 * A screen, a route, an index or a piece of data written as if it chose,
 * said or owned something. What happens is that a person did it through the
 * screen, or the code does it; the sentence names that instead.
 */
const PERSONIFIED = /(?:下書き|データセット|研究|バージョン|画面|サーバー|server|script|route|索引|アシスタント|選択) ?が(?:作っ|作る|書い|書く|選ん|選ぶ|決め|決める|言[いうっ]|答え|断|持[たちつてっ]|主張|知ら)/

type LineKind = "blank" | "fence" | "code" | "heading" | "list" | "table" | "quote" | "html" | "indented" | "prose"

/** A block can begin on any of these without a blank line before it. */
const BLOCK_STARTS: ReadonlySet<LineKind> = new Set(["blank", "fence", "code", "heading", "list", "table", "quote", "html"])

/** A prose line right after one of these begins a new paragraph. */
const BLOCK_ENDS: ReadonlySet<LineKind> = new Set(["blank", "fence", "heading"])

function docFiles(): string[] {
  return readdirSync(DOCS).filter((name) => name.endsWith(".md")).sort()
}

function read(name: string): string {
  return readFileSync(join(DOCS, name), "utf8")
}

/** Every file the writing rules apply to, as `[label, text]`. */
function styledFiles(): [string, string][] {
  return [
    ...docFiles().map((name): [string, string] => [`docs/${name}`, read(name)]),
    ["README.md", readFileSync(join(ROOT, "README.md"), "utf8")],
    ["assistant-api/README.md", readFileSync(join(ROOT, "assistant-api", "README.md"), "utf8")],
  ]
}

function lineCount(text: string): number {
  return text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length
}

/** Inline code may hold any character: a file name, a command, an operator. */
function withoutInlineCode(line: string): string {
  return line.replace(/`[^`]*`/g, "")
}

/**
 * What each line of a markdown text is. Only what can begin a block counts
 * as structure; an indented line that is not a list item is the tail of the
 * block above it.
 */
function classifyLines(text: string): LineKind[] {
  let inFence = false
  return text.split("\n").map((line): LineKind => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      return "fence"
    }
    if (inFence) return "code"
    if (line.trim() === "") return "blank"
    if (/^#{1,6}\s/.test(line)) return "heading"
    if (/^\s*(?:[-*+]|\d+\.)\s/.test(line)) return "list"
    if (line.startsWith("|")) return "table"
    if (line.startsWith(">")) return "quote"
    if (line.startsWith("<")) return "html"
    if (/^\s/.test(line)) return "indented"
    return "prose"
  })
}

/**
 * Line numbers (1-based) where a paragraph or a list item goes on to a second
 * line: an indented tail, or a prose line that follows anything other than a
 * blank line, a heading or a code fence.
 */
function brokenParagraphLines(text: string): number[] {
  const kinds = classifyLines(text)
  return kinds.flatMap((kind, index) => {
    if (kind === "indented") return [index + 1]
    if (BLOCK_STARTS.has(kind)) return []
    const previous = kinds[index - 1] ?? "blank"
    return BLOCK_ENDS.has(previous) ? [] : [index + 1]
  })
}

function coinedWords(line: string): string[] {
  const text = withoutInlineCode(line)
  return COINED
    .filter(({ pattern, allowed = [] }) => pattern.test(allowed.reduce((rest, word) => rest.replaceAll(word, ""), text)))
    .map(({ word }) => word)
}

function personified(line: string): string[] {
  return PERSONIFIED.test(withoutInlineCode(line)) ? ["擬人化"] : []
}

function hasBold(line: string): boolean {
  return /\*\*|__[^_\s]/.test(withoutInlineCode(line))
}

function lineHits(check: (line: string) => string[]): string[] {
  return styledFiles().flatMap(([label, text]) =>
    text.split("\n").flatMap((line, index) => check(line).map((what) => `${label}:${index + 1} ${what}`)),
  )
}

describe("docs", () => {
  it("検査する対象のファイルと行がある", () => {
    expect(docFiles().length).toBeGreaterThanOrEqual(10)
    const kinds = styledFiles().flatMap(([, text]) => classifyLines(text))
    expect(kinds.filter((kind) => kind === "prose").length).toBeGreaterThan(50)
    expect(kinds.filter((kind) => kind === "list").length).toBeGreaterThan(200)
    expect(kinds.filter((kind) => kind === "code").length).toBeGreaterThan(10)
  })

  it("どのファイルも 300 行に収まる", () => {
    const over = docFiles()
      .map((name) => [name, lineCount(read(name))] as const)
      .filter(([, lines]) => lines > MAX_LINES_PER_FILE)
    expect(over).toEqual([])
  })

  it("全部で 2,000 行に収まる", () => {
    const total = docFiles().reduce((sum, name) => sum + lineCount(read(name)), 0)
    expect(total).toBeLessThanOrEqual(MAX_LINES_TOTAL)
  })

  it("README の索引と docs のファイルが 1 対 1 に対応する", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8")
    const indexed = [...readme.matchAll(/\]\(docs\/([^)#]+\.md)\)/g)].map((match) => match[1]).sort()
    expect([...new Set(indexed)]).toEqual(docFiles())
  })

  it("px の値・経緯・未決の語を含まない", () => {
    const hits = docFiles().flatMap((name) =>
      read(name).split("\n").flatMap((line, index) =>
        FORBIDDEN
          .filter(([, pattern]) => pattern.test(line))
          .map(([what]) => `${name}:${index + 1} ${what}`),
      ),
    )
    expect(hits).toEqual([])
  })

  it("太字を使わない", () => {
    expect(lineHits((line) => (hasBold(line) ? ["太字"] : []))).toEqual([])
  })

  it("段落と箇条書きの項目を途中で改行しない", () => {
    const hits = styledFiles().flatMap(([label, text]) =>
      brokenParagraphLines(text).map((line) => `${label}:${line}`),
    )
    expect(hits).toEqual([])
  })

  it("造語と比喩を使わない", () => {
    expect(lineHits(coinedWords)).toEqual([])
  })

  it("画面・データ・コードを擬人化しない", () => {
    expect(lineHits(personified)).toEqual([])
  })
})

describe("docs の書き方の検査", () => {
  it("段落と項目の途中の改行を見つけ、構造の行とコードは見逃す", () => {
    const text = [
      "# 見出し",
      "段落の 1 行目",
      "段落の 2 行目",
      "",
      "- 項目",
      "項目の続き",
      "- 次の項目",
      "  字下げした続き",
      "  - 入れ子の項目",
      "1. 番号付きの項目",
      "",
      "| a | b |",
      "|---|---|",
      "> 引用",
      "",
      "```bash",
      "echo 1",
      "  echo 2",
      "```",
      "コードの後の段落",
    ].join("\n")
    expect(brokenParagraphLines(text)).toEqual([3, 6, 8])
  })

  it("1 行ずつの段落と箇条書きは通す", () => {
    const text = ["# 見出し", "段落。", "", "- 項目", "- 項目", "", "段落。", ""].join("\n")
    expect(brokenParagraphLines(text)).toEqual([])
  })

  it("太字を見つけ、inline code の中は見ない", () => {
    expect(hasBold("これは **太字** である")).toBe(true)
    expect(hasBold("これは __太字__ である")).toBe(true)
    expect(hasBold("`a ** b` と `__init__` と snake_case")).toBe(false)
  })

  it("造語を見つけ、許した複合語と inline code の中は見ない", () => {
    expect(coinedWords("新しい版を作る")).toEqual(["版"])
    expect(coinedWords("研究の箱に入れる")).toEqual(["箱"])
    expect(coinedWords("印を付ける")).toEqual(["印"])
    expect(coinedWords("取り込みの源")).toEqual(["源"])
    expect(coinedWords("ID の台帳")).toEqual(["台帳"])
    expect(coinedWords("一覧を畳む")).toEqual(["畳む"])
    expect(coinedWords("画面が名乗る")).toEqual(["名乗る"])
    expect(coinedWords("公開ゲートを通す")).toEqual(["公開ゲート"])
    expect(coinedWords("研究のフォルダに置く")).toEqual(["研究のフォルダ"])
    expect(coinedWords("研究の記述を書く")).toEqual(["記述"])
    expect(coinedWords("主の ID と主でない ID")).toEqual(["主の ID"])
    expect(coinedWords("互換性の約束")).toEqual(["約束"])
    expect(coinedWords("次の要求から効く")).toEqual(["効く"])
    expect(coinedWords("DB には届かない")).toEqual(["届く"])
    expect(coinedWords("変わらない更新は断る")).toEqual(["断る"])
    expect(coinedWords("ファイルを運ぶ")).toEqual(["運ぶ"])
    expect(coinedWords("値を落とす")).toEqual(["落とす"])
    expect(coinedWords("同じ番号で出し直す")).toEqual(["出し直す"])
    expect(coinedWords("外から来る唯一の入口")).toEqual(["入口"])
    expect(coinedWords("絞り込みの軸")).toEqual(["軸"])
    expect(coinedWords("1 段増える")).toEqual(["段"])
    expect(coinedWords("描画では黙って除く")).toEqual(["黙って"])
    expect(coinedWords("出版物と矢印と情報源とバージョン")).toEqual([])
    expect(coinedWords("自由記述のキーを有効にし、割り当てを判断する段落と前段")).toEqual([])
    expect(coinedWords("画面を組み立てる。テストが落ちる。持ち主の ID")).toEqual([])
    expect(coinedWords("`版` と書く")).toEqual([])
  })

  it("画面・データ・コードを主語にした擬人化を見つけ、人が主語の文は通す", () => {
    expect(personified("この下書きが作ったデータセット")).toEqual(["擬人化"])
    expect(personified("データセットが選んだファイル")).toEqual(["擬人化"])
    expect(personified("その存在は研究が決める")).toEqual(["擬人化"])
    expect(personified("script が断る")).toEqual(["擬人化"])
    expect(personified("画面が言う")).toEqual(["擬人化"])
    expect(personified("選択はファイルの存在を主張しない。選択が主張する")).toEqual(["擬人化"])
    expect(personified("この下書きで作成したデータセット")).toEqual([])
    expect(personified("データセットに紐づけたファイル")).toEqual([])
    expect(personified("番号は admin が決める")).toEqual([])
    expect(personified("`画面が言う` と書く")).toEqual([])
  })
})
