import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * English identifiers, comments and test names do not use the metaphors that
 * turn into Japanese coinages once somebody translates them: a research's S3
 * prefix is not a "box", importing is not "taking", a header bar is not a
 * "band", a link is not a "way". `pin` and `slot` are defined terms and stay.
 *
 * Two kinds of check. Identifiers and path fragments are banned anywhere in a
 * file, since they reach the comments through the names. Words that are
 * ordinary English in other senses are banned only in comment lines and test
 * names, where they describe the code.
 */

const ROOT = join(import.meta.dirname, "..")
const SELF = "app/wording.test.ts"

const SCAN_DIRS = ["app", "scripts", "tests", "docker", "migration", "assistant-api/src"]
const SKIP_DIR_NAMES = new Set(["node_modules", "__pycache__", "dist", "build", "input"])
const SOURCE_EXTENSION = /\.(ts|tsx|js|jsx|py|sh|yml|yaml|conf|css)$/

function isRootConfigFile(name: string): boolean {
  return SOURCE_EXTENSION.test(name) || name === "Dockerfile" || name.startsWith("env.")
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || SKIP_DIR_NAMES.has(entry.name)) return []
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return SOURCE_EXTENSION.test(entry.name) ? [full] : []
  })
}

function filesToScan(): string[] {
  const nested = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
  const rootLevel = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isRootConfigFile(entry.name))
    .map((entry) => join(ROOT, entry.name))
  return [...nested, ...rootLevel]
}

interface Banned {
  term: string
  pattern: RegExp
  /** Whole matches that are standard terms rather than the metaphor. */
  allowed?: readonly string[]
}

/** Identifiers, attribute names and path fragments, checked on every line. */
export const BANNED_NAMES: readonly Banned[] = [
  {
    term: "box",
    pattern: /\b[A-Za-z]*Box\w*|\bbox[A-Z]\w*|\b(?![A-Z_]*CHECKBOX)[A-Z_]*BOX[A-Z_]*\b|\bfiles\/box\b|`common\/` box|\b(?:public|private|retired) box(?:es)?\b|\bresearch's box\b|\bbox screen\b/g,
    allowed: ["SearchBox", "ComboBox", "boundingBox", "viewBox"],
  },
  { term: "take (import)", pattern: /\b[A-Za-z]+Take(?:[A-Z]\w*)?\b|\bTake[A-Z]\w*|\btake[A-Z]\w*|\btake-in\b|\/take\b/g },
  { term: "face", pattern: /\b\w*Face\b|\bFace[A-Z]\w*/g },
  { term: "gate", pattern: /\b\w*Gate(?!way)\w*|\bgates?\b|\bGATE_\w*|publish-gate/g },
  {
    term: "mark",
    pattern: /\b\w*Mark(?:s|ed)?\b|\bMarked\w*|\bmark[A-Z]\w*|\b[A-Z_]*MARKS?\b|\bdata-mark\b/g,
    allowed: ["markNotApplicable", "CommonMark", "ESTAT_MARKS", "ESCAPED_MARK"],
  },
  { term: "band", pattern: /\b\w*Band\w*|\bbands?\b|\b[A-Z_]*BAND[A-Z_]*\b/g },
  { term: "way (link)", pattern: /\bWayTo\b|\b\w*Ways\b|\bway[A-Z]\w*|\b[A-Z]\w*Way\b|\bWAY_\w*|\/way\b/g },
  { term: "fold (collapse)", pattern: /<\/?Fold\b|\bFold[A-Z]\w*|\b\w+Fold(?!er)\w*|\b\w*Unfold\w*|\bfold[A-Z]\w*|\/fold\b/g },
  { term: "carry", pattern: /\b\w*Carr(?:y|ies|ied)\w*|\bcarr(?:y|ies|ied|ying)[A-Z]\w*|\bCARRY\w*|\bcarry-(?:files|report)\b|\bmigration\/carry\b/g },
  { term: "ledger", pattern: /\b[Ll]edgers?\b|\b\w*Ledger\w*/g },
  { term: "standing", pattern: /\b\w+Standing\w*|\bStanding[A-Z]\w*|\bstanding[A-Z]\w*|\b\w*STANDING\w*/g },
  { term: "deed", pattern: /\bdeeds?\b|Deed/g },
  { term: "seat", pattern: /\bseats?\b|\bSeat\w*/g },
  { term: "tools row", pattern: /\btools? rows?\b/gi },
  { term: "landed", pattern: /\bdata-landed\b|\bland(?:At|On|ingPath)\b|\bdataset\.landed\b/g },
  { term: "place", pattern: /\bdata-place\b|\b\w*Places\b|\bPlaceGroups?\b|\bPublishPlaceView\b/g },
  { term: "head", pattern: /\bPageHead\b|\bhead card\b|\bstep strip\b|\bstrip of steps\b/g },
  { term: "ground", pattern: /\bGround\b|\breadGround\b/g },
]

/** Words that are ordinary English elsewhere, checked in comment lines and test names only. */
export const BANNED_WORDS: readonly Banned[] = [
  { term: "face", pattern: /(?<!\bclock )\bfaces?\b(?! outwards)/g },
  { term: "wears", pattern: /\b(?:wears?|wearing)\b/g },
  { term: "speaks", pattern: /\bspeaks?\b/g },
  { term: "lives in", pattern: /\blives in\b/g },
  { term: "says", pattern: /\bsays\b/g },
  { term: "answers with", pattern: /\banswer(?:s|ed) with\b/g },
  { term: "way (link)", pattern: /(?<!\bon )(?<!\bits )(?<!\btheir )\b(?:[Tt]he|[Aa]) way (?:in|out|back)\b|\bway through the pages\b|\b[Aa] way to (?:another|the) screen\b/g },
  { term: "fold (collapse)", pattern: /\b(?:[Ff]olded|[Uu]nfolded) (?:pane|box|panel|card|field|head)\b/g },
]

/**
 * Japanese in comments and test names follows the same word list as the docs
 * and the screen: plain spoken Japanese, the words the screen and the code
 * use, no metaphors and no code, screen or data that speaks or owns things.
 * `allowed` holds ordinary compounds, cut out of the text before matching.
 */
export const BANNED_JA: readonly { term: string, pattern: RegExp, allowed?: readonly RegExp[] }[] = [
  { term: "版", pattern: /版/g, allowed: [/出版/g] },
  { term: "箱", pattern: /箱/g },
  { term: "印", pattern: /印/g, allowed: [/矢印/g, /印刷/g] },
  { term: "器", pattern: /器/g, allowed: [/機器/g, /容器/g] },
  { term: "源", pattern: /源/g, allowed: [/情報源/g, /資源/g, /電源/g] },
  { term: "姿", pattern: /姿/g },
  { term: "綴り", pattern: /綴/g },
  { term: "台帳", pattern: /台帳/g },
  { term: "札", pattern: /札/g },
  { term: "帯", pattern: /帯/g, allowed: [/時間帯/g, /帯域/g, /携帯/g] },
  { term: "写し", pattern: /写[しす]/g },
  { term: "畳む", pattern: /畳/g },
  { term: "名乗る", pattern: /名乗/g },
  { term: "名指す", pattern: /名指/g },
  { term: "区画", pattern: /区画/g },
  { term: "の行 (tool bar, heading)", pattern: /(?:道具|ツール|名前|足元)の行/g },
  { term: "足元", pattern: /足元/g },
  { term: "段", pattern: /段/g, allowed: [/段落/g, /段階/g, /段組/g, /手段/g, /階段/g, /値段/g, /普段/g, /別段/g] },
  { term: "枠", pattern: /枠/g, allowed: [/枠線/g] },
  { term: "窓", pattern: /窓/g, allowed: [/検索窓/g] },
  { term: "軸", pattern: /軸/g, allowed: [/[縦横]軸/g] },
  { term: "約束", pattern: /約束/g },
  { term: "効く", pattern: /(?<![有無])効[くいかきけ]/g },
  { term: "届く", pattern: /届[くかいきけ]/g, allowed: [/届け出/g] },
  { term: "断る", pattern: /(?<![判中決遮切横診分油])断[るらりっれろ]/g },
  { term: "撥ねる・弾く", pattern: /撥|弾[くかきけいこ]/g },
  { term: "運ぶ", pattern: /運[ぶびんばべ]|搬入/g },
  { term: "割る", pattern: /(?<![役分])割[るれっらり](?![当合振込])/g },
  { term: "落とす・落ちる", pattern: /(?<![段見])落[ちとさ]/g, allowed: [/(?:テスト|test|検査|CI|build|ビルド|lint|typecheck)(?:が|は|も|で)落ち/g] },
  { term: "置き場", pattern: /置き場/g },
  { term: "打つ (入力)", pattern: /打[つっちてたと]/g, allowed: [/コマンドを打/g] },
  { term: "出し直す", pattern: /出し直/g },
  { term: "入口", pattern: /入り?口|編集口|受け入れ口/g },
  { term: "答え", pattern: /答[えう]/g },
  { term: "持ち方", pattern: /持ち方/g },
  { term: "材料", pattern: /材料/g, allowed: [/判断材料/g] },
  { term: "欠け", pattern: /欠け/g },
  { term: "焼く", pattern: /焼/g },
  { term: "立つ・立てる", pattern: /(?<![成役目際]|組み)立[つってたち](?![ち上]|上|会)/g },
  { term: "倒れる", pattern: /(?<![面圧])倒[れしす]/g },
  { term: "光る", pattern: /光[るらりっれ]/g },
  { term: "渡る", pattern: /渡[るらりっれ]/g },
  { term: "浮く", pattern: /浮[くかいきけ]/g },
  { term: "黙って", pattern: /黙/g },
  { term: "報せ・知らせ", pattern: /報せ|(?<!お)知らせ/g },
  { term: "読ませる", pattern: /読ませ/g },
  { term: "話しかける", pattern: /話しかけ|呼びかけ/g },
  { term: "言う (擬人化)", pattern: /(?:画面|面|ページ|文|欄|ボタン|見出し|名前|server|ラベル|バッジ|アイコン)が言[うっわいえ]/g },
  { term: "持つ (擬人化)", pattern: /(?:画面|route|部品|ページ|サイト|バー|フッタ|ヘッダ|ヘッダー|カード|一覧|ボタン|メニュー|パネル|ダイアログ|リンク|書き出し|索引|eslint|server|script|行|列|欄)が持[つっちたて]/g },
  { term: "下書きが作った (擬人化)", pattern: /(?:下書き|データセット|研究|バージョン)が(?:作っ|書い|選ん|選択して|更新して)/g },
]

const TEST_NAME = /^\s*(?:it|describe|test)(?:\.each\(.*?\))?\(\s*["'`]/
/** Test names in any form: `test.describe(`, `describe.skipIf(x)(`, and the name line of a multi-line `it.each([...])(`. */
const ANY_TEST_NAME = /^\s*(?:(?:it|describe|test)(?:\.\w+(?:\(.*?\))?)*|\]\))\(\s*["'`]/

/** Dev-only screens whose text is checked on every line, since it never reaches the i18n messages. */
const DEV_ONLY_FILES = new Set(["app/routes/dev-ui.tsx"])

/** Files whose lines list the banned words as data. */
const JA_RULE_FILES = new Set([SELF, "app/docs.test.ts", "app/i18n/messages.test.ts"])

function isDescriptive(line: string, file: string): boolean {
  const start = line.trimStart()
  if (isHashCommented(file)) return start.startsWith("#")
  return start.startsWith("*") || start.startsWith("//") || start.startsWith("/*") || start.startsWith("{/*") || TEST_NAME.test(line)
}

function matches(line: string, rules: readonly Banned[]): string[] {
  return rules.flatMap(({ term, pattern, allowed = [] }) =>
    [...line.matchAll(pattern)]
      .map((match) => match[0])
      .filter((found) => !allowed.includes(found))
      .map((found) => `${term}: ${found}`),
  )
}

function isHashCommented(file: string): boolean {
  return /\.(py|sh|yml|yaml|conf)$/.test(file) || file.endsWith("Dockerfile") || /(^|\/)env\./.test(file)
}

/** The part of a line that describes code: the whole of a comment line or test name, else a trailing comment. */
function descriptivePart(line: string, file: string): string {
  if (DEV_ONLY_FILES.has(file) || isDescriptive(line, file) || ANY_TEST_NAME.test(line)) return line
  const trailing = isHashCommented(file) ? /\s#\s(.*)$/.exec(line) : /\s(?:\/\/|\{?\/\*)\s(.*)$/.exec(line)
  return trailing?.[1] ?? ""
}

/** Every banned Japanese word in the comments and test names of one file, as `line: term: match`. */
export function japaneseViolations(text: string, file: string): string[] {
  let inBlockComment = false
  return text.split("\n").flatMap((line, index) => {
    const part = inBlockComment ? line : descriptivePart(line, file)
    const closes = line.includes("*/")
    const opens = /^\s*\{?\/\*/.test(line) && !/\*\/[^*]*$/.test(line.replace(/^\s*\{?\/\*/, ""))
    if (!isHashCommented(file)) inBlockComment = inBlockComment ? !closes : opens
    if (!/[\u3040-\u30ff\u4e00-\u9fff]/.test(part)) return []
    return BANNED_JA.flatMap(({ term, pattern, allowed = [] }) => {
      const rest = allowed.reduce((kept, word) => kept.replace(word, (found) => "\u3000".repeat(found.length)), part)
      return [...rest.matchAll(pattern)].map((match) => `${index + 1}: ${term}: ${match[0]}`)
    })
  })
}

/** Every banned name and word in one file's text, as `line: term: match`. */
export function violations(text: string, file: string): string[] {
  return text.split("\n").flatMap((line, index) => [
    ...matches(line, BANNED_NAMES),
    ...(isDescriptive(line, file) ? matches(line, BANNED_WORDS) : []),
  ].map((hit) => `${index + 1}: ${hit}`))
}

describe("wording", () => {
  it("検査が違反を見つけ、許した語は見逃す", () => {
    const planted = [
      "import { composeBox, BoxEntry } from \"~/files/box\"",
      "export function TakeFace() { return adminDraftTakePath(\"r\", \"d\") + \"/take\" }",
      "const gate = publishGate(input) // GateFinding",
      "<IdMark kind=\"research\" /> <MarkButton /> data-mark",
      "<BandBox /> <Band tone=\"brand\" /> onBand",
      "<WayTo to=\"/\" /> <DraftWays /> group-hover/way",
      "<Fold summary=\"x\" /> foldShown group/fold",
      "planCarry(census) HUMANDBS_CARRY_SOURCE migration/carry-files.ts",
      "BranchStanding data-landed landAt MarkedPlace data-place PageHead readGround",
      " * the pin ledger, the deed, its seat and the tools row",
      " * The screen wears the state it says, and speaks the query it lives in.",
      "  it(\"answers with the way out of the box screen\", () => {",
      " * A folded pane and the faces of a control.",
    ].join("\n")
    const terms = new Set(violations(planted, "app/planted.tsx").map((hit) => hit.split(": ")[1]))
    expect([...terms].sort()).toEqual([
      "answers with", "band", "box", "carry", "deed", "face", "fold (collapse)", "gate", "ground", "head", "landed", "ledger", "lives in", "mark",
      "place", "says", "seat", "speaks", "standing", "take (import)", "tools row", "way (link)", "wears",
    ].sort())

    const allowed = [
      "<SearchBox /> <ComboBox /> await row.boundingBox() viewBox=\"0 0 24 24\"",
      "markNotApplicable(slot) CommonMark ESTAT_MARKS ESCAPED_MARK",
      "const taken = pinTaken || LabelTaken || takesMany(vocabulary)",
      "const gateway = Gateway // the input a Checkbox takes, INVESTIGATE_RESEARCHER_HISTORY",
      "setFolder(uploadFolder) migrationsFolder; Standing on a coloured bar; acknowledgeRequest; CHECKBOX_CELL",
      " * The value is converted once on the way in, and on its way out.",
      " * A clock face, and a menu that faces outwards.",
      "const answer = await fetch(url) // a label pin, a value slot and an answer with content",
    ].join("\n")
    expect(violations(allowed, "app/allowed.tsx")).toEqual([])
  })

  it("日本語の検査がコメントと test 名の違反を見つけ、普通の複合語とコードの文字列は見逃す", () => {
    const planted = [
      "// 最新版の箱に印を付ける器。源の姿を綴りで写し、畳んで名乗り、名指す。台帳の札と帯",
      "/**",
      " * 頭の区画と区画、道具の行・ツールの行・名前の行と足元の行、段と枠と窓と軸",
      " * 約束が効く。届く答えを断り、撥ねて弾く。運ぶと割る",
      " */",
      "  it(\"値が落ちる・置き場に打つと出し直す入口の持ち方\", () => {",
      "  describe(\"材料の欠けを焼き、フラグが立つと倒れる\", () => {",
      "  test.describe(\"光る・渡る・浮く・黙って・報せ・読ませる・話しかける\", () => {",
      "const x = 1 // 画面が言う。バーが持つ。下書きが作った",
      "{/* 選ばれた区画",
      "    だけが塗られる */}",
    ].join("\n")
    const terms = new Set(japaneseViolations(planted, "app/planted.tsx").map((hit) => hit.split(": ")[1]))
    expect([...terms].sort()).toEqual(BANNED_JA.map(({ term }) => term).sort())

    const allowed = [
      "// 出版・矢印・印刷・機器・情報源・時間帯。段落と段階と段組みの列、枠線と検索窓、縦軸と横軸",
      "// 有効・無効、届け出、判断る前に中断する、役割を分割り当てする、見落とし",
      "  it(\"テストが落ちる。コマンドを打つ。判断材料。組み立てて役立つ。面倒な事\", () => {",
      "const label = \"区画の枠に印を付ける\"",
      "expect(html).not.toContain(\"aria-label=\\\"下書きの段\\\"\")",
      "const glob = \"/*\"",
      "const label2 = \"窓\"",
    ].join("\n")
    expect(japaneseViolations(allowed, "app/allowed.tsx")).toEqual([])
    expect(japaneseViolations("# 枠の中に置く", "compose.yml")).toHaveLength(1)
    expect(japaneseViolations("  [\"entry\", \"入り口\"],", "app/routes/dev-ui.tsx")).toHaveLength(1)
  })

  it("コードとコメントに比喩の語が無い", () => {
    const hits = filesToScan().flatMap((full) => {
      const rel = relative(ROOT, full)
      if (rel === SELF) return []
      return violations(readFileSync(full, "utf8"), rel).map((hit) => `${rel}:${hit}`)
    })
    expect(hits).toEqual([])
  })

  it("コメントと test 名に使わない語が無い", () => {
    const hits = filesToScan().flatMap((full) => {
      const rel = relative(ROOT, full)
      if (JA_RULE_FILES.has(rel)) return []
      return japaneseViolations(readFileSync(full, "utf8"), rel).map((hit) => `${rel}:${hit}`)
    })
    expect(hits).toEqual([])
  })
})
