import type {
  DatasetDetailResponse,
  ResearchDetailResponse,
  ResearchVersionsListResponse,
  Summary,
} from "@humandbs/backend/types";

/**
 * Leaf text value as it appears in backend responses: normalized `text` plus the
 * legacy `rawHtml` (null on API-created records). Derived from an existing exported
 * type since `TextValue` itself isn't re-exported from the types barrel.
 */
export type TextValue = NonNullable<Summary["aims"]["ja"]>;

/**
 * Frontend-local view types layered over the backend response.
 *
 * The backend is never modified. `renderedHtml` is a frontend-only projection of a
 * field's editable `text` Markdown source, computed by the transforms in
 * `./transforms.ts`. The legacy `rawHtml` field keeps its original meaning (the raw
 * HTML the crawler captured; `null` on API-created records) and is never overwritten.
 *
 * Only the 5 in-scope rendered fields are widened with `renderedHtml`:
 *   - summary.aims / summary.methods / summary.targets
 *   - releaseNote (research detail + versions list)
 *   - experiment.data.* (dataset detail)
 *
 * Out-of-scope fields (experiment.header, the various `name` fields) intentionally
 * keep the plain `TextValue` shape, so the types stay honest about what is populated.
 */

/** A single leaf text value widened with the frontend-only `renderedHtml` projection. */
export type RenderedTextValue = TextValue & { renderedHtml?: string };

/** Bilingual `{ ja, en }` of {@link RenderedTextValue} (each side nullable). */
export type RenderedBilingualTextValue = {
  ja: RenderedTextValue | null;
  en: RenderedTextValue | null;
};

/** Bilingual `{ ja, en }` of {@link TextValue} (each side nullable). */
export type BilingualTextValue = {
  ja: TextValue | null;
  en: TextValue | null;
};

/**
 * Minimal input shapes the transforms read. The transforms are reused for both the
 * server read path (full backend response) and the admin client preview (partial,
 * form-derived values), so they accept only the fields they actually touch — every
 * other response field is preserved by spread without being typed here.
 */

export type ResearchRenderInput = {
  data: {
    summary?: {
      aims?: BilingualTextValue | null;
      methods?: BilingualTextValue | null;
      targets?: BilingualTextValue | null;
    } | null;
    releaseNote?: BilingualTextValue | null;
  } & Record<string, unknown>;
} & Record<string, unknown>;

export type ResearchVersionsRenderInput = {
  data: ({ releaseNote?: BilingualTextValue | null } & Record<string, unknown>)[];
} & Record<string, unknown>;

export type DatasetRenderInput = {
  data: {
    experiments?:
      | ({ data?: Record<string, BilingualTextValue | null> } & Record<string, unknown>)[]
      | null;
  } & Record<string, unknown>;
} & Record<string, unknown>;

// === Research detail ===

type ResearchDetailData = ResearchDetailResponse["data"];

/** Research detail `data` with `renderedHtml` on aims/methods/targets + releaseNote. */
export type RenderedResearchDetailData = Omit<ResearchDetailData, "summary" | "releaseNote"> & {
  summary: Omit<ResearchDetailData["summary"], "aims" | "methods" | "targets"> & {
    aims: RenderedBilingualTextValue;
    methods: RenderedBilingualTextValue;
    targets: RenderedBilingualTextValue;
  };
  releaseNote: RenderedBilingualTextValue;
};

export type RenderedResearchDetailResponse = Omit<ResearchDetailResponse, "data"> & {
  data: RenderedResearchDetailData;
};

// === Research versions list ===

type ResearchVersionItem = ResearchVersionsListResponse["data"][number];

/** A versions-list item with `renderedHtml` on its releaseNote. */
export type RenderedResearchVersionItem = Omit<ResearchVersionItem, "releaseNote"> & {
  releaseNote: RenderedBilingualTextValue;
};

export type RenderedResearchVersionsListResponse = Omit<ResearchVersionsListResponse, "data"> & {
  data: RenderedResearchVersionItem[];
};

// === Dataset detail ===

type DatasetDetailData = DatasetDetailResponse["data"];
type Experiment = DatasetDetailData["experiments"][number];

/** An experiment with `renderedHtml` on each `data.*` value (header stays plain). */
export type RenderedExperiment = Omit<Experiment, "data"> & {
  data: Record<string, RenderedBilingualTextValue | null>;
};

export type RenderedDatasetDetailData = Omit<DatasetDetailData, "experiments"> & {
  experiments: RenderedExperiment[];
};

export type RenderedDatasetDetailResponse = Omit<DatasetDetailResponse, "data"> & {
  data: RenderedDatasetDetailData;
};
