import { renderMarkdown } from "@/utils/markdown";

import type {
  BilingualTextValue,
  DatasetRenderInput,
  RenderedBilingualTextValue,
  RenderedDatasetDetailResponse,
  RenderedResearchDetailResponse,
  RenderedResearchVersionsListResponse,
  RenderedTextValue,
  ResearchRenderInput,
  ResearchVersionsRenderInput,
  TextValue,
} from "./types";

/**
 * Pure, isomorphic transforms that layer a frontend-only `renderedHtml` projection
 * over a backend response, derived from each in-scope field's editable `text`.
 *
 * Built on the existing async `renderMarkdown` pipeline. `rawHtml` is always left
 * untouched (the legacy reference admins rewrite from). These functions are free of
 * React / network and are unit-tested directly (see `transforms.test.ts`).
 */

/** Render one leaf `TextValue`'s `text` into `renderedHtml`, preserving `rawHtml`. */
async function renderTextValue(value: TextValue | null): Promise<RenderedTextValue | null> {
  if (value == null) return value;
  const { markup } = await renderMarkdown(value.text ?? "");
  return { ...value, renderedHtml: markup };
}

/**
 * Render both language sides of a bilingual field into `renderedHtml`.
 * `null` sides and absent fields pass through unchanged.
 */
export async function renderBilingualField(
  field: BilingualTextValue | null | undefined,
): Promise<RenderedBilingualTextValue> {
  if (field == null) {
    return { ja: null, en: null };
  }
  const [ja, en] = await Promise.all([renderTextValue(field.ja), renderTextValue(field.en)]);
  return { ja, en };
}

/**
 * Research detail: render aims, methods, targets, and releaseNote into
 * `renderedHtml`. Returns the widened research-detail view type.
 */
export async function addResearchRenderedHtml(
  response: ResearchRenderInput,
): Promise<RenderedResearchDetailResponse> {
  const data = response.data;
  const summary = data.summary;

  const [aims, methods, targets, releaseNote] = await Promise.all([
    renderBilingualField(summary?.aims),
    renderBilingualField(summary?.methods),
    renderBilingualField(summary?.targets),
    renderBilingualField(data.releaseNote),
  ]);

  return {
    ...response,
    data: {
      ...data,
      summary: { ...summary, aims, methods, targets },
      releaseNote,
    },
  } as RenderedResearchDetailResponse;
}

/**
 * Research versions list: render each version's releaseNote into `renderedHtml`.
 * Walks the array; returns the widened versions-list view type.
 */
export async function addResearchVersionsRenderedHtml(
  response: ResearchVersionsRenderInput,
): Promise<RenderedResearchVersionsListResponse> {
  const data = await Promise.all(
    response.data.map(async (version) => ({
      ...version,
      releaseNote: await renderBilingualField(version.releaseNote),
    })),
  );

  return { ...response, data } as RenderedResearchVersionsListResponse;
}

/**
 * Dataset detail: walk each experiment's `data` record and render every value's
 * `text` into `renderedHtml` (ja/en independently). `experiment.header` stays
 * plain. Returns the widened dataset-detail view type.
 */
export async function addDatasetRenderedHtml(
  response: DatasetRenderInput,
): Promise<RenderedDatasetDetailResponse> {
  const data = response.data;

  const experiments = await Promise.all(
    (data.experiments ?? []).map(async (experiment) => {
      const entries = await Promise.all(
        Object.entries(experiment.data ?? {}).map(
          async ([key, value]) => [key, await renderBilingualField(value)] as const,
        ),
      );
      return {
        ...experiment,
        data: Object.fromEntries(entries),
      };
    }),
  );

  return {
    ...response,
    data: { ...data, experiments },
  } as RenderedDatasetDetailResponse;
}
