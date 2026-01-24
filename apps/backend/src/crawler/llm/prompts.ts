/**
 * LLM prompts for field extraction
 */

/**
 * Extraction prompt for biomedical experiment metadata
 */
export const EXTRACTION_PROMPT = `Extract structured metadata from biomedical experiment data.
Input is JSON with "en" and "ja" keys containing English and Japanese versions of the same experiment.
Use both versions to extract the most complete information.
Output in English only. Return ONLY valid JSON object, no explanation.

## Output Schema

{
  "subjectCount": number | null,
  "subjectCountType": "individual" | "sample" | "mixed" | null,
  "healthStatus": "healthy" | "affected" | "mixed" | null,
  "diseases": [{ "label": string, "icd10": string | null }],
  "tissue": string | null,
  "isTumor": boolean | null,
  "cellLine": string | null,
  "assayType": string | null,
  "libraryKit": string | null,
  "platformVendor": string | null,
  "platformModel": string | null,
  "readType": "single-end" | "paired-end" | null,
  "readLength": number | null,
  "targets": string | null,
  "fileTypes": string[],
  "dataVolume": { "value": number, "unit": "KB" | "MB" | "GB" | "TB" } | null
}

## Field Descriptions

### subjectCount (number | null)
Total number of subjects/participants/cases in the study.
- Count individuals, not samples (e.g., "39症例" -> 39, "17 cases" -> 17)
- If multiple groups, sum them (e.g., "20 patients + 10 controls" -> 30)
- null if not specified or unclear

### subjectCountType ("individual" | "sample" | "mixed" | null)
What the count represents:
- "individual": counting people/patients (症例, 例, patients, cases, subjects, individuals)
- "sample": counting biological specimens (サンプル, samples, specimens, 検体)
- "mixed": both individuals and samples mentioned, or unclear distinction
- null if not determinable

### healthStatus ("healthy" | "affected" | "mixed" | null)
Health condition of the subjects:
- "affected": subjects have a disease/condition (if ANY disease mentioned, default to this)
- "healthy": ONLY healthy controls/normal subjects explicitly stated (健常者, healthy controls)
- "mixed": both affected patients AND healthy controls included
- null if not determinable

### diseases (array of { label: string, icd10: string | null })
ALL diseases/conditions mentioned in the data. Extract EVERY disease found.
- label: disease name in English (translate Japanese if needed)
- icd10: ICD-10 code if explicitly stated (e.g., "ICD10: C71" -> "C71"), otherwise null
- Examples:
  - "astrocytoma (ICD10: C71)" -> { "label": "astrocytoma", "icd10": "C71" }
  - "肺がん" -> { "label": "lung cancer", "icd10": null }
  - "難聴" -> { "label": "hearing loss", "icd10": null }

### tissue (string | null)
Primary biological tissue/specimen type:
- Examples: "peripheral blood", "tumor tissue", "brain tissue", "saliva"
- Translate Japanese: "末梢血" -> "peripheral blood", "腫瘍組織" -> "tumor tissue"
- null if not specified

### isTumor (boolean | null)
Whether the sample is from tumor/cancer tissue:
- true: tumor, cancer, malignant tissue, or 腫瘍
- false: normal tissue, non-tumor, healthy tissue
- null: not determinable or not applicable

### cellLine (string | null)
Cell line name if used:
- Examples: "HeLa", "HEK293", "iPSC"
- null if no cell line used or not specified

### assayType (string | null)
Type of experimental assay/method:
- Extract as written in source (e.g., "Exome", "WGS", "RNA-seq", "Microarray", "ChIP-seq")
- null if not specified

### libraryKit (string | null)
Library preparation kit name:
- Examples: "Agilent SureSelect Human All Exon v.4", "TruSeq DNA PCR-Free"
- null if not specified

### platformVendor (string | null)
Sequencing platform manufacturer:
- Examples: "Illumina", "Thermo Fisher", "PacBio", "Oxford Nanopore"
- Normalize variations: "Life Technologies" -> "Thermo Fisher"
- null if not specified

### platformModel (string | null)
Specific instrument model:
- Examples: "HiSeq 2000", "NovaSeq 6000", "Ion PGM", "MinION"
- Extract from patterns like "Illumina [HiSeq 2000]" -> "HiSeq 2000"
- null if not specified

### readType ("single-end" | "paired-end" | null)
Sequencing read type:
- "single-end" or "paired-end" (case-insensitive matching)
- null if not specified

### readLength (number | null)
Read length in base pairs:
- Extract number from patterns like "100 bp", "150bp" -> 100, 150
- null if not specified

### targets (string | null)
Target regions for capture/enrichment:
- Keep as original text if specified
- null if not specified or whole genome/exome

### fileTypes (string[])
List of data file formats:
- Examples: ["FASTQ", "BAM", "VCF", "BED", "CRAM"]
- Extract from patterns like "fastq, bam" -> ["FASTQ", "BAM"]
- Empty array [] if not specified

### dataVolume ({ value: number, unit: string } | null)
Total data size:
- Extract numeric value and unit separately
- Examples: "500 GB" -> { "value": 500, "unit": "GB" }, "1.2 TB" -> { "value": 1.2, "unit": "TB" }
- null if not specified

## Important Rules

1. Prefer [EN] values when available, use [JA] to fill gaps or clarify ambiguity
2. Extract ALL diseases mentioned - this is a list, not a single value
3. If external metadata is provided, use it to supplement missing information
4. Return empty array [] for fileTypes if none found, not null

Input:
`
