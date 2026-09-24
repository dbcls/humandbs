import { describe, expect, it } from "vitest"

import { messagesFor } from "./messages"

/**
 * The sentence a panel says under its name (`Confirm` の `warning`) is a
 * sentence: it says what pressing does and closes with whether that can be
 * taken back, so it ends the way a sentence does. A phrase left open reads as
 * a label, and the reader is left to guess whether the deed can be undone.
 */
function warnings(node: unknown, path: string): [string, string][] {
  // A word made from its arguments is read as what it makes — a string, or the
  // lines of a note given one per line.
  if (typeof node === "function") return warnings((node as (...args: unknown[]) => unknown)("x", "y", "z"), path)
  if (typeof node === "string") return [[path, node]]
  if (node !== null && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => warnings(value, `${path}.${key}`))
  }
  return []
}

describe("面の文", () => {
  const all = warnings(messagesFor("ja").admin, "admin")
    .filter(([path]) => path.endsWith("Warning"))

  it("警告の文は句点で結ぶ", () => {
    expect(all.length).toBeGreaterThan(15)
    expect(all.filter(([, text]) => !text.endsWith("。")).map(([path]) => path)).toStrictEqual([])
  })

  it("警告の文は敬体 (です・ます) で結ぶ", () => {
    expect(all.filter(([, text]) => !/です|ます/.test(text)).map(([path]) => path)).toStrictEqual([])
  })

  it("削除の語は文の中でも「削除」で、「消え」「消せ」を使わない", () => {
    const admin = warnings(messagesFor("ja").admin, "admin")
    expect(admin.filter(([, text]) => /消[えせさす]/.test(text)).map(([path]) => path)).toStrictEqual([])
  })

  it("research の版は「バージョン」で、「版」の字は出さない", () => {
    const admin = warnings(messagesFor("ja").admin, "admin")
    expect(admin.filter(([, text]) => /(?<!出)版/.test(text)).map(([path]) => path)).toStrictEqual([])
  })

  it("「いま」で始まる文は無い — 面が開いている時点のことしか言わないので", () => {
    expect(all.filter(([, text]) => text.startsWith("いま")).map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * The last path segment names the kind of string, not the component that
 * happened to render it: a field's own name (`accessionHint`, `numberNote`)
 * can end the same way a description does without being one, so those two
 * are named exceptions rather than a broader pattern.
 */
function lastKey(path: string): string {
  return path.split(".").at(-1) ?? path
}

const NOTE_OR_HINT_EXCEPTIONS = new Set([
  "admin.templates.accessionHint", // Field の label (欄の名前) で、説明文ではない
  "admin.datasetEditor.numberNote", // 欄の aria-label/placeholder (欄の名前) で、説明文ではない
])

/**
 * h1 の下・節の説明 (note) と欄の下の説明 (hint) は常体で言い切る — 画面が読者に
 * 話しかける敬体と、事実を言うだけの常体を混ぜない (`decisions.md` の「語」)。
 */
describe("note と hint の文体", () => {
  const isNoteOrHint = (key: string): boolean =>
    key === "note" || key === "hint" || /[a-z\d](Note|Hint)$/.test(key)

  const all = warnings(messagesFor("ja").admin, "admin")
    .filter(([path]) => isNoteOrHint(lastKey(path)))
    .filter(([path]) => !NOTE_OR_HINT_EXCEPTIONS.has(path))

  it("規則に掛かる件数が十分ある", () => {
    expect(all.length).toBeGreaterThan(20)
  })

  it("句点で終わる", () => {
    expect(all.filter(([, text]) => !text.endsWith("。")).map(([path]) => path)).toStrictEqual([])
  })

  it("「です」「ます」を含まない (常体で言い切る)", () => {
    expect(all.filter(([, text]) => /です|ます/.test(text)).map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 理由は「〜ため、」で結ぶ。「〜ので、」は同じ働きの和語で、2 つが混ざると読者は
 * 使い分けの意味を探してしまう (`decisions.md` の「語」)。
 */
describe("理由の結び方", () => {
  it("「〜ので、」を含まない", () => {
    const admin = warnings(messagesFor("ja").admin, "admin")
    expect(admin.filter(([, text]) => text.includes("ので、")).map(([path]) => path)).toStrictEqual([])
  })
})

/** Every Japanese string the interface says, public and admin alike. */
const JA = warnings(messagesFor("ja"), "ja")

/**
 * A markdown link's target is an address, not words: its brackets and what is
 * inside them are not the sentence's.
 */
function withoutLinkTargets(text: string): string {
  return text.replace(/\]\([^)]*\)/g, "]")
}

/**
 * Where a bracket stands without the half-width space the rule asks for.
 * **At the start or end of the line and next to punctuation it needs none.**
 */
function cramped(text: string): boolean {
  const plain = withoutLinkTargets(text)
  return /[^\s([「『]\(/.test(plain) || /\)[^\s)\]。、」』,.:;]/.test(plain)
}

/**
 * 括弧は ja でも全部半角 `( )` で、前後に半角の空白を置く (行頭・行末・句読点の隣を除く)。
 * 区切りの全角スラッシュ「／」も使わない。
 */
describe("括弧と区切り", () => {
  // A search example is a value typed into the box as it is, not a sentence.
  const QUERY_VALUES = new Set(["ja.search.exampleQueries.2"])

  it("規則に掛かる件数が十分ある", () => {
    expect(JA.length).toBeGreaterThan(500)
    expect(JA.filter(([, text]) => text.includes("(")).length).toBeGreaterThan(10)
  })

  it("検査は全角括弧・全角スラッシュ・詰まった括弧を見つける", () => {
    expect(/[（）／]/.test("カート（3 件）")).toBe(true)
    expect(cramped("カート(3 件)")).toBe(true)
    expect(cramped("カート (3 件)です")).toBe(true)
    expect(cramped("カート (3 件)")).toBe(false)
    expect(cramped("作成してください (詳細は[こちら](https://example.org/a(b)))。")).toBe(false)
  })

  it("全角括弧と全角スラッシュを含まない", () => {
    expect(JA.filter(([, text]) => /[（）／]/.test(text)).map(([path]) => path)).toStrictEqual([])
  })

  it("括弧の前後に半角空白がある", () => {
    const offenders = JA.filter(([path, text]) => !QUERY_VALUES.has(path) && cramped(text))
    expect(offenders.map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 公開側の news は「お知らせ」で、admin と同じ 1 つの名前で呼ぶ。
 * en は News のまま。
 */
describe("news の語", () => {
  it("ja は「ニュース」を使わない", () => {
    expect(JA.length).toBeGreaterThan(500)
    expect(JA.filter(([, text]) => text.includes("ニュース")).map(([path]) => path)).toStrictEqual([])
  })

  it("公開側の見出しも「お知らせ」", () => {
    expect(messagesFor("ja").news.heading).toBe("お知らせ")
    expect(messagesFor("en").news.heading).toBe("News")
  })
})

/**
 * What stands where rows would be says there are none in one form:
 * 「{もの}はありません。」, and 「条件に合う{もの}はありません。」 when a narrowing
 * emptied the list. **Not in the past tense** — the list is empty now, not
 * "was found empty" — and not 「まだ」, which promises rows to come.
 */
const EMPTY_KEY = /^(none|empty|emptyRow|nobodyYet|no[A-Z]\w*|\w+Empty|\w+None)$/

/** Keys that match the naming but carry a refusal rather than an empty list. */
const NOT_EMPTY_STATES = new Set([
  "ja.admin.datasetEditor.filesEmpty", // 紐づけられない理由
  "ja.admin.files.noBox", // 公開できない理由
])

/** Narrowed lists: the empty state after conditions were applied. */
const FILTERED_EMPTY = /(^|\.)(noMatch\w*|search\.none|research\.none|templates\.none|datasetEditor\.noKey|datasetEditor\.noCandidate)$/

function firstSentence(text: string): string {
  return `${text.split("。")[0] ?? ""}。`
}

/** 「{もの}はありません。」 (人なら「いません」) で、「まだ」を持たない — 2 文目は続けてよい。 */
function saysEmpty(text: string): boolean {
  const first = firstSentence(text)
  return /はありません。$|はいません。$/.test(first) && !first.includes("まだ")
}

describe("空の表示", () => {
  const empties = JA
    .filter(([path]) => EMPTY_KEY.test(lastKey(path)))
    .filter(([path]) => !NOT_EMPTY_STATES.has(path))
    // A word standing in for a value (「未選択」) is not a sentence about a list.
    .filter(([, text]) => text.endsWith("。"))

  it("規則に掛かる件数が十分ある", () => {
    expect(empties.length).toBeGreaterThan(40)
    expect(empties.filter(([path]) => FILTERED_EMPTY.test(path)).length).toBeGreaterThan(8)
  })

  it("検査は崩れた形を見つける", () => {
    expect(saysEmpty("記事はありません。")).toBe(true)
    expect(saysEmpty("記事はまだありません。")).toBe(false)
    expect(saysEmpty("バージョンがありません。")).toBe(false)
    expect(saysEmpty("提供者は登録されていません。")).toBe(false)
    expect(saysEmpty("カートは空です。")).toBe(false)
  })

  it("「ありませんでした」(過去形) を使わない", () => {
    expect(JA.filter(([, text]) => text.includes("ありませんでした")).map(([path]) => path)).toStrictEqual([])
  })

  it("「{もの}はありません。」の形で、「まだ」を持たない", () => {
    const offenders = empties.filter(([, text]) => !saysEmpty(text))
    expect(offenders.map(([path]) => path)).toStrictEqual([])
  })

  it("絞り込みの 0 件は「条件に合う{もの}はありません。」", () => {
    const offenders = empties
      .filter(([path]) => FILTERED_EMPTY.test(path))
      .filter(([, text]) => !text.startsWith("条件に合う"))
    expect(offenders.map(([path]) => path)).toStrictEqual([])
  })

  it("「その条件に当てはまる」「その語を含む」「当てはまる」の言い方を使わない", () => {
    const offenders = JA.filter(([, text]) => /当てはまる|その語を含む/.test(text))
    expect(offenders.map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 別の場所で先に書かれたときの答えは 1 文で、全画面が同じ文を言う。次にすることが
 * どの画面でも同じなので、語も同じにする。
 */
describe("衝突の答え", () => {
  const admin = messagesFor("ja").admin
  const said = warnings(admin, "admin").filter(([, text]) => /別の場所で.*(編集|変更)されました/.test(text))

  it("規則に掛かる件数が十分ある — 共通の文と、記事の画面の 409", () => {
    expect(said.length).toBeGreaterThanOrEqual(2)
    expect(admin.contents.problems.stale).toBe(admin.conflict)
  })

  it("どれも共通の 1 文と同じ", () => {
    expect(said.filter(([, text]) => text !== admin.conflict).map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 面の文・断り・操作の答えは敬体で結ぶ。常体で終わるのは
 * 画面の説明と欄の下の説明 (note / hint) だけで、読む人に話しかける文には混ぜない。
 * 公開側の文はどれも読者に話しかけるものなので、全部が敬体。
 */
function plainEnding(sentence: string): boolean {
  if (/(です|ます|ません|ました|ましょう|ください|でした)。$/.test(sentence)) return false
  return /[うくすつぬふむゆるぐずづぶぷだたい]。$/.test(sentence)
}

describe("話しかける文の文体", () => {
  const SPOKEN_KEY = /(Warning|Failed|Refused|Required|Taken|Malformed|Reserved|Updating|Switching)$|^(conflict|gone|missing|same|unchanged|blockedReason|notAdmin|absent|notConnected|queued|reanalyzing)$/
  const spokenAdmin = JA
    .filter(([path]) => path.startsWith("ja.admin."))
    .filter(([path]) => SPOKEN_KEY.test(lastKey(path))
      || /\.(problems|done)\./.test(path)
      || (EMPTY_KEY.test(lastKey(path)) && !NOT_EMPTY_STATES.has(path)))
  const publicSide = JA.filter(([path]) => !path.startsWith("ja.admin."))
  const sentences = (text: string): string[] => withoutLinkTargets(text).match(/[^。]*。/g) ?? []

  it("規則に掛かる件数が十分ある", () => {
    expect(spokenAdmin.flatMap(([, text]) => sentences(text)).length).toBeGreaterThan(60)
    expect(publicSide.flatMap(([, text]) => sentences(text)).length).toBeGreaterThan(30)
  })

  it("検査は常体の結びを見つけ、敬体と体言止めは通す", () => {
    expect(plainEnding("この値を伝える。")).toBe(true)
    expect(plainEnding("代表アドレスになる。")).toBe(true)
    expect(plainEnding("必要だ。")).toBe(true)
    expect(plainEnding("元に戻せません。")).toBe(false)
    expect(plainEnding("入力してください。")).toBe(false)
    expect(plainEnding("データ登録手順は[こちら]。")).toBe(false)
  })

  it("admin の面の文・断り・答えは常体で結ばない", () => {
    const offenders = spokenAdmin.filter(([, text]) => sentences(text).some(plainEnding))
    expect(offenders.map(([path]) => path)).toStrictEqual([])
  })

  it("公開側の文は常体で結ばない", () => {
    const offenders = publicSide.filter(([, text]) => sentences(text).some(plainEnding))
    expect(offenders.map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 「破棄」「外す」「未記載」「未割り当て」「English」「併合」はそれぞれ「削除」「解除」「未入力」
 * 「未発行」「英語」「統合」に言い換えた古い語で、1 つの概念を 2 つの語で言う状態に戻さない
 * (`decisions.md` の「語」)。
 */
describe("言い換えた古い語", () => {
  const admin = warnings(messagesFor("ja").admin, "admin")
  const banned = ["破棄", "外す", "未記載", "未割り当て", "English", "併合", "箱"]

  it.each(banned)("「%s」を含まない", (word) => {
    expect(admin.filter(([, text]) => text.includes(word)).map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 画面の語は、提供者やキュレーターが普段使う語で書く。作り手の間だけで通じる比喩
 * (「カートの印」「この面」「箱」「版」「DDBJ Search が答えない」など) は使わず、
 * バッジ・ボタン・アイコン・バージョン・取り込み元・内容・経路・文字列・コピーなど
 * 普通の語で言う。「画面」「矢印」「出版」のように一般の語の一部として現れる字は
 * `ORDINARY` で除いてから数える。
 */
const COINED = [
  "印", "箱", "版", "源", "器", "面", "姿", "道", "綴り", "台帳", "札", "帯", "写し",
  "畳", "名乗", "答え", "立つ", "立っ", "倒れ", "区画", "張り替え",
]
const ORDINARY = /画面|表面|場面|書面|矢印|印刷|出版|情報源|都道府県|北海道/g

function coinedIn(text: string): string[] {
  const plain = text.replace(ORDINARY, "")
  return COINED.filter((word) => plain.includes(word))
}

describe("作り手の間だけで通じる語", () => {
  it("規則に掛かる件数が十分ある", () => {
    expect(JA.length).toBeGreaterThan(500)
  })

  it("検査は比喩の語を見つけ、一般の語の中の字は通す", () => {
    expect(coinedIn("研究一覧のカートの印から追加してください。")).toStrictEqual(["印"])
    expect(coinedIn("この面に出すもの")).toStrictEqual(["面"])
    expect(coinedIn("DDBJ Search が答えなかった")).toStrictEqual(["答え"])
    expect(coinedIn("代表アドレスを張り替えました。")).toStrictEqual(["張り替え"])
    expect(coinedIn("この画面を開いた後に、矢印キーで動かす")).toStrictEqual([])
    expect(coinedIn("情報源間で不一致があります")).toStrictEqual([])
  })

  it("ja の語に比喩の語を含まない", () => {
    const offenders = JA.flatMap(([path, text]) => coinedIn(text).map((word) => `${path}: ${word}`))
    expect(offenders).toStrictEqual([])
  })
})

/**
 * 解析手法の画面で選べるものは「値」で、「語」「語彙」「カタログ」とは呼ばない — 画面の語は
 * key / 値 / 選択肢の 3 つで、語彙は仕組みの名前であって画面の名前ではない。
 * 「日本語」「英語」の中の「語」は言語の名前なので数えない。
 */
describe("解析手法の画面の語", () => {
  const catalog = warnings(messagesFor("ja").admin.catalog, "admin.catalog")
    .map(([path, text]) => [path, text.replace(/(日本|英)語/g, "")] as const)

  it("選べるものを「語」と呼ばない", () => {
    expect(catalog.filter(([, text]) => text.includes("語")).map(([path]) => path)).toStrictEqual([])
  })

  it.each(["語彙", "カタログ"])("admin に「%s」を出さない", (word) => {
    const admin = warnings(messagesFor("ja").admin, "admin")
    expect(admin.filter(([, text]) => text.includes(word)).map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 列見出しの日付語は 公開日・承認日・更新日・更新日時・公開日時・作成日時 の 6 つに絞る —
 * 「更新」単独は日付なのか時刻を含むのか読者に分からない (`decisions.md` の「語」)。
 */
describe("列見出しの日付語", () => {
  function headerGroups(node: unknown, path: string): [string, unknown][] {
    if (node === null || typeof node !== "object") return []
    return Object.entries(node).flatMap(([key, value]) => {
      const own: [string, unknown][]
        = (key === "columns" || key === "headers" || key === "sortKeys")
          && value !== null && typeof value === "object"
          ? [[`${path}.${key}`, value]]
          : []
      return [...own, ...headerGroups(value, `${path}.${key}`)]
    })
  }

  const values = headerGroups(messagesFor("ja").admin, "admin")
    .flatMap(([path, group]) => warnings(group, path))

  it("規則に掛かる件数が十分ある", () => {
    expect(values.length).toBeGreaterThan(10)
  })

  it("「更新」単独の見出しが無い", () => {
    expect(values.filter(([, text]) => text === "更新").map(([path]) => path)).toStrictEqual([])
  })

  it("日付語は 公開日・承認日・更新日・更新日時・公開日時・作成日時 のどれか", () => {
    const allowed = new Set(["公開日", "承認日", "更新日", "更新日時", "公開日時", "作成日時"])
    const looksLikeDate = /日時?$/
    const offenders = values.filter(([, text]) => looksLikeDate.test(text) && !allowed.has(text))
    expect(offenders.map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 押せるものの語は名詞で終わる。よく使う動作の語
 * (create/delete/save/add/remove) と、確かめる面の中で実行するボタン (`〜Confirm`)
 * は「〜する」で終わらない、というよくある崩れをここで止める。
 */
describe("button の語は動詞止めにしない", () => {
  const isCommonAction = (key: string): boolean =>
    /^(create|delete|save|add|remove)([A-Z]|$)/.test(key) || key.endsWith("Confirm")

  const admin = warnings(messagesFor("ja").admin, "admin")
    .filter(([path]) => isCommonAction(lastKey(path)))

  it("規則に掛かる件数が十分ある", () => {
    expect(admin.length).toBeGreaterThan(15)
  })

  it("「する」で終わらない", () => {
    expect(admin.filter(([, text]) => text.endsWith("する")).map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 押せるものの語は名詞で終わり、動詞の終止形で終わらない。
 * 押せるものかどうかは key の名前で見分ける — 動作の語で始まり、説明・見出し・状態の語尾を
 * 持たない key。**例外は「閉じる」1 つ**で、捨てるものを持たない面の出口の語として決まっている。
 */
const PRESSABLE_KEY = /^(create|delete|save|add|remove|edit|publish|unpublish|withdraw|discard|unpin|reissue|merge|cancel|undo|look|upload|apply|choose|repoint|rename|cut|show|hide|post|resolve|reopen|copy|pin|dismiss|reanalyze|refresh|overwrite|schedule|issueNha|makePrimary|stopUpdating|stopSharing|startSharing|copyToDraft|createEmptyDraft|confirm|take|open|done|download|grab|goToLine|moveUp|moveDown|up|down|linkFiles|chooseFiles)([A-Z]\w*)?$/
const NOT_PRESSABLE = /(Title|Warning|Note|Hint|Placeholder|Failed|Required|Blocked|Heading|Switching|Undated|Refused|Label|Column|Reason|Said|Field|Comment|Instructions|Start|Over|End|Choosing)$/
const VERB_ENDING = /[うくすつぬふむゆるぐずづぶぷ]$/
const DECIDED_VERBS = new Set(["閉じる"])

describe("押せるものの語は名詞で終わる", () => {
  const pressables = warnings(messagesFor("ja").admin, "admin")
    .filter(([path]) => PRESSABLE_KEY.test(lastKey(path)) && !NOT_PRESSABLE.test(lastKey(path)))
    .filter(([, text]) => !text.endsWith("。"))
  const paths = new Set(pressables.map(([path]) => path))

  it("規則に掛かる件数が十分あり、崩れやすい語の key を含む", () => {
    expect(pressables.length).toBeGreaterThan(100)
    for (const path of [
      "admin.detail.stopUpdating",
      "admin.detail.stopUpdatingConfirm",
      "admin.cancel",
      "admin.catalog.mergeInto",
      "admin.catalog.undo",
      "admin.templates.look",
      "admin.comment.reopen",
      "admin.leave.confirm",
    ]) expect(paths).toContain(path)
  })

  it("検査は動詞の終止形を見つける", () => {
    for (const word of ["更新をやめる", "取り消す", "未解決に戻す", "調べる", "元に戻す"]) {
      expect(VERB_ENDING.test(word)).toBe(true)
    }
    for (const word of ["更新の中止", "取り消し", "解決の取り消し", "検索", "キャンセル"]) {
      expect(VERB_ENDING.test(word)).toBe(false)
    }
  })

  it("動詞の終止形で終わらない (決まった「閉じる」を除く)", () => {
    const offenders = pressables.filter(([, text]) => VERB_ENDING.test(text) && !DECIDED_VERBS.has(text))
    expect(offenders.map(([path]) => path)).toStrictEqual([])
  })

  it("確かめる面の実行の語は、面の名前が言う動作と同じ", () => {
    const detail = messagesFor("ja").admin.detail
    const catalog = messagesFor("ja").admin.catalog
    expect(detail.stopUpdatingTitle("v1").endsWith(detail.stopUpdatingConfirm)).toBe(true)
    expect(detail.stopUpdating).toBe(detail.stopUpdatingConfirm)
    expect(catalog.mergeTitle("a", "b").endsWith(catalog.mergeConfirm)).toBe(true)
    expect(catalog.mergeInto).toBe(catalog.mergeConfirm)
  })
})

/**
 * What can be pressed in the admin area is named by a noun, and "〜を追加" is
 * not one: it is "追加する" with the verb cut short, so it reads as a verb even
 * though the last characters are a noun. The object is joined with "の"
 * instead — 「リンクの追加」.
 */
describe("押せるものの語", () => {
  const admin = warnings(messagesFor("ja").admin, "admin")
    .filter(([, text]) => !text.endsWith("。"))

  it("「〜を追加」の形 (を + 動作名詞で終わる) を使わない — 対象は「の」で結ぶ", () => {
    const cut = /を(追加|削除|作成|保存|選択|コピー|ダウンロード|編集|表示|更新|公開|解除|取り込み|統合|破棄|変更)$/
    expect(admin.filter(([, text]) => cut.test(text)).map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * A word standing where a value would be is not wrapped in parentheses: the
 * quieter colour already says it is not the value, and a bracketed word says
 * the same thing twice.
 */
describe("値が無いことを言う語", () => {
  const admin = warnings(messagesFor("ja").admin, "admin")
  const preview = warnings(messagesFor("ja").preview, "preview")

  it("括弧で囲まない", () => {
    const bracketed = [...admin, ...preview]
      .filter(([, text]) => text.startsWith("（") || text.startsWith("("))
      .map(([path]) => path)
    expect(bracketed).toStrictEqual([])
  })
})

/**
 * The sentence the site says at the top of every page is an alert, and it is
 * called that in both areas: 「お知らせ」 is what news is called, and 「告知」 is
 * a third word for the same thing.
 */
describe("全ページの上部に出る 1 文の語", () => {
  const ja = warnings(messagesFor("ja"), "ja")

  it("「アラート」で呼び、「告知」を使わない", () => {
    expect(ja.filter(([, text]) => text.includes("告知")).map(([path]) => path)).toStrictEqual([])
  })

  it("読者に向けた名前も「アラート」で、news の「お知らせ」と混ぜない", () => {
    expect(messagesFor("ja").announcements).toBe("アラート")
    expect(messagesFor("ja").dismissAnnouncement).not.toContain("お知らせ")
  })
})

/**
 * The note over the research's table of versions and drafts tells a curator
 * which button does what, by the button's own word in 「」. A word renamed on
 * the button and not in the note sends the reader looking for a button that
 * is not there — so every word the note quotes has to be a word some button
 * on the way actually carries.
 */
describe("研究の編集の「バージョンと下書き」の説明文", () => {
  const admin = messagesFor("ja").admin
  const note = admin.detail.rowsNote.join("")
  const buttons = new Set([
    admin.detail.createEmptyDraft,
    admin.detail.copyToDraft,
    admin.detail.edit,
    admin.take.open,
  ])

  it("「」で名指す語は、どれも実際のボタンの語", () => {
    const quoted = [...note.matchAll(/「([^」]+)」/g)].map((match) => match[1])
    expect(quoted.length).toBeGreaterThan(0)
    for (const word of quoted) expect(buttons).toContain(word)
  })

  it("下書きを作る 2 つの道、作成後の取り込み、公開中のバージョンの更新のすべてを名指す", () => {
    for (const word of buttons) expect(note).toContain(`「${word}」`)
    expect(note).toContain(admin.take.application)
  })

  it("どの行も常体の文で閉じる", () => {
    for (const line of admin.detail.rowsNote) {
      expect(line).toMatch(/。$/)
      expect(line).not.toMatch(/です。|ます。/)
    }
  })
})
