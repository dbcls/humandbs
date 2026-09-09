import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { messagesFor } from "~/i18n/messages"

import { Abstract, type AssessmentData } from "./admin-assistant-client"

const words = messagesFor("ja").admin.assistant

describe("研究概要の原文比較", () => {
  it("対応する和訳と原文に同じ比較 ID を付ける", () => {
    const report: AssessmentData = {
      abstract: "First sentence. Second sentence.",
      abstract_translation: {
        translated_abstract: "最初の文です。二番目の文です。",
      },
      abstract_sentence_pairs: [
        {
          pair_id: "sentence-1",
          source_sentence: "First sentence.",
          translated_sentence: "最初の文です。",
        },
        {
          pair_id: "sentence-1",
          source_sentence: "Second sentence.",
          translated_sentence: "二番目の文です。",
        },
      ],
    }

    const html = renderToStaticMarkup(<Abstract report={report} words={words} />)

    expect(html.match(/data-abstract-pair-id="sentence-1-0"/g)).toHaveLength(2)
    expect(html.match(/data-abstract-pair-id="sentence-1-1"/g)).toHaveLength(2)
    expect(html.match(/tabindex="0"/g)).toHaveLength(4)
  })
})
