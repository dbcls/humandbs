import { describe, expect, it } from "vitest"

import { messagesFor } from "./messages"

/**
 * The sentence a panel says under its name (`Confirm` の `warning`) is a
 * sentence: it says what pressing does and closes with whether that can be
 * taken back, so it ends the way a sentence does. A phrase left open reads as
 * a label, and the reader is left to guess whether the deed can be undone.
 */
function warnings(node: unknown, path: string): [string, string][] {
  if (typeof node === "function") {
    return [[path, (node as (...args: unknown[]) => string)("x", "y", "z")]]
  }
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

  it("research の版は「バージョン」で、「版」の字は出さない (docs/glossary.md)", () => {
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
 * 話しかける敬体と、事実を言うだけの常体を混ぜない (`docs/ui.md`、`decisions.md` の「語」)。
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

/**
 * 括弧は半角 `( )` で、全角 `（ ）` を混ぜない (`decisions.md` の「語」)。
 */
describe("括弧の全角・半角", () => {
  it("全角括弧を含まない", () => {
    const admin = warnings(messagesFor("ja").admin, "admin")
    expect(admin.filter(([, text]) => /[（）]/.test(text)).map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 「破棄」「外す」「未記載」「未割り当て」「English」「併合」はそれぞれ「削除」「解除」「未入力」
 * 「未発行」「英語」「統合」に言い換えた古い語で、1 つの概念を 2 つの語で言う状態に戻さない
 * (`decisions.md` の「語」、`docs/admin-ui.md` の「語と文」)。
 */
describe("言い換えた古い語", () => {
  const admin = warnings(messagesFor("ja").admin, "admin")
  const banned = ["破棄", "外す", "未記載", "未割り当て", "English", "併合", "箱"]

  it.each(banned)("「%s」を含まない", (word) => {
    expect(admin.filter(([, text]) => text.includes(word)).map(([path]) => path)).toStrictEqual([])
  })
})

/**
 * 解析手法の画面で選べるものは「値」で、「語」「語彙」「カタログ」とは呼ばない — 画面の語は
 * key / 値 / 選択肢の 3 つで、語彙は仕組みの名前であって画面の名前ではない (`docs/admin-ui.md` の
 * 「語と文」)。「日本語」「英語」の中の「語」は言語の名前なので数えない。
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
 * 押せるものの語は名詞で終わる (`docs/ui.md` の「押せるもの」)。よく使う動作の語
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
 * What can be pressed in the admin area is named by a noun, and "〜を追加" is
 * not one: it is "追加する" with the verb cut short, so it reads as a verb even
 * though the last characters are a noun. The object is joined with "の"
 * instead — 「リンクの追加」 (`docs/ui.md` の「押せるもの」).
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
 * the same thing twice (`docs/ui.md` の「壊れるもの」).
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
 * a third word for the same thing (`docs/glossary.md`).
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
