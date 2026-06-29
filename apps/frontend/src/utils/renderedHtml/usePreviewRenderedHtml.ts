import { useEffect, useState } from "react";

import { addDatasetRenderedHtml, addResearchRenderedHtml } from "./transforms";
import type {
  DatasetRenderInput,
  RenderedDatasetDetailData,
  RenderedResearchDetailData,
  ResearchRenderInput,
} from "./types";

/**
 * Client-side admin-preview hooks: run the same per-shape transform used on the
 * public read path over live (unsaved) form values, in an effect, and store the
 * widened result in state. This guarantees the admin preview equals the public
 * output without making the public card async.
 *
 * Until the first render completes, `undefined` is returned and the caller should
 * render nothing (or a placeholder).
 */

export function useResearchPreviewRenderedHtml(
  data: ResearchRenderInput["data"],
): RenderedResearchDetailData | undefined {
  const [rendered, setRendered] = useState<RenderedResearchDetailData>();

  useEffect(() => {
    let cancelled = false;
    addResearchRenderedHtml({ data })
      .then((res) => {
        if (!cancelled) setRendered(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data]);

  return rendered;
}

export function useDatasetPreviewRenderedHtml(
  data: DatasetRenderInput["data"],
): RenderedDatasetDetailData | undefined {
  const [rendered, setRendered] = useState<RenderedDatasetDetailData>();

  useEffect(() => {
    let cancelled = false;
    addDatasetRenderedHtml({ data })
      .then((res) => {
        if (!cancelled) setRendered(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data]);

  return rendered;
}
