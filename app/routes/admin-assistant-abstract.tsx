import { useState } from "react"

import { PaneHeading, Stack } from "~/components/base"
import { Section } from "~/components/page"

import type { AssessmentData, AssistantWords } from "./admin-assistant-model"
import { display, joined } from "./admin-assistant-report-primitives"

export function Abstract({
  report,
  words,
}: {
  report: AssessmentData
  words: AssistantWords
}) {
  const sentencePairs = report.abstract_sentence_pairs
  const pairs = sentencePairs !== undefined
    && sentencePairs.length > 0
    && sentencePairs.every(
      (pair) =>
        Boolean(pair.source_sentence?.trim())
        && Boolean(pair.translated_sentence?.trim()),
    )
    ? sentencePairs.map((pair, index) => {
        const pairId = pair.pair_id?.trim()
        return {
          ...pair,
          comparisonId: `${pairId === undefined || pairId === "" ? "abstract-sentence" : pairId}-${index}`,
        }
      })
    : undefined
  const translation = report.abstract_translation?.translated_abstract?.trim()
  const [activePairId, setActivePairId] = useState<string>()
  return (
    <Section title={words.abstract}>
      <Stack gap="tight">
        {translation && pairs !== undefined && pairs.length > 0
          ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <AbstractPanel
                  title={words.translation}
                  sentences={pairs.map((pair) => ({
                    id: pair.comparisonId,
                    text: pair.translated_sentence,
                  }))}
                  activePairId={activePairId}
                  setActivePairId={setActivePairId}
                  words={words}
                />
                <AbstractPanel
                  title={words.original}
                  sentences={pairs.map((pair) => ({
                    id: pair.comparisonId,
                    text: pair.source_sentence,
                  }))}
                  activePairId={activePairId}
                  setActivePairId={setActivePairId}
                  words={words}
                />
              </div>
            )
          : translation
            ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <AbstractPanel
                    title={words.translation}
                    text={translation}
                    words={words}
                  />
                  <AbstractPanel
                    title={words.original}
                    text={report.abstract}
                    words={words}
                  />
                </div>
              )
            : (
                <p className="whitespace-pre-wrap text-sm">
                  {display(report.abstract, words)}
                </p>
              )}
        <p className="text-ink-muted text-sm">
          {words.icd10}
          :
          {joined(report.abstract_icd10_list, ", ")}
        </p>
      </Stack>
    </Section>
  )
}

function AbstractPanel({
  title,
  sentences,
  text,
  activePairId,
  setActivePairId,
  words,
}: {
  title: string
  sentences?: { id: string, text?: string | null }[]
  text?: string | null
  activePairId?: string
  setActivePairId?: (id: string | undefined) => void
  words: AssistantWords
}) {
  return (
    <div className="rounded border border-line bg-surface p-3">
      <Stack gap="tight">
        <PaneHeading title={title} level="h3" rule="start" />
        <p className="whitespace-pre-wrap text-sm">
          {sentences?.map((sentence) => (
            <span
              key={sentence.id}
              data-abstract-pair-id={sentence.id}
              tabIndex={0}
              // **選ばれている 1 文だけが面を持つ。**焦点の輪郭は `app.css` の
              // `:focus-visible` が site に 1 つ持っているので、ここで消して
              // 引き直さない (`docs/ui.md` の「壊れるもの」)。
              className={`mr-1 rounded px-1 transition-colors ${
                activePairId === sentence.id ? "bg-surface-hover text-ink" : ""
              }`}
              onMouseEnter={() => setActivePairId?.(sentence.id)}
              onMouseLeave={() => setActivePairId?.(undefined)}
              onFocus={() => setActivePairId?.(sentence.id)}
              onBlur={() => setActivePairId?.(undefined)}
            >
              {display(sentence.text, words)}
            </span>
          )) ?? display(text, words)}
        </p>
      </Stack>
    </div>
  )
}
