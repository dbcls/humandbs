import type { estypes } from "@elastic/elasticsearch"

/**
 * Index analysis settings shared by every HumanDBs ES index.
 *
 * The default analyzer is kuromoji-based, so every text field (all_text, title,
 * summary, typeOfData, …) tokenizes Japanese by morpheme and lowercases Latin —
 * `肺がん` → `肺` / `がん`, `CANCER` → `cancer`. It is wired as
 * `analysis.analyzer.default`, so no per-field analyzer wiring is needed and
 * keyword fields (IDs) stay unaffected (keywords are not analyzed).
 *
 * Requires the `analysis-kuromoji` plugin, baked into the ES image
 * (docker/elasticsearch/Dockerfile). The analyzer is fixed at field-creation
 * time, so changing it needs an index recreate + full reingest
 * (docs/data-model.md § catch-all field).
 */
export const INDEX_ANALYSIS_SETTINGS: estypes.IndicesIndexSettingsAnalysis = {
  analyzer: {
    default: {
      type: "custom",
      tokenizer: "kuromoji_tokenizer",
      filter: [
        "cjk_width",
        "kuromoji_baseform",
        "kuromoji_part_of_speech",
        "ja_stop",
        "kuromoji_stemmer",
        "lowercase",
      ],
    },
  },
}
