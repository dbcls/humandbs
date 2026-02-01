/**
 * LLM prompts for field extraction
 */

/**
 * Extraction prompt for biomedical experiment metadata
 */
export const EXTRACTION_PROMPT = `You are a metadata extraction assistant for biomedical research datasets.

## Task

Extract structured fields from experiment metadata. The input is JSON with:
- "en": English version of experiment table
- "ja": Japanese version of the same experiment
- "externalMetadata": API metadata (TITLE, DESCRIPTION, etc.)

Use ALL available information to extract fields. When both ja/en exist, cross-reference them.

## Rules

1. Output ALL text fields in English.
   - Translate Japanese to English (e.g. "末梢血" → "peripheral blood", "腫瘍組織" → "tumor tissue")
   - Do NOT normalize or standardize synonyms. Keep the translated term as close to the original meaning as possible.
   - Example: "Life Technologies" stays "Life Technologies" (do NOT change to "Thermo Fisher")
   - Example: "Exome" stays "Exome" (do NOT change to "WXS" or "WES")
2. If information is not present in the input, return null (or empty array for array fields). Do NOT guess or infer.
3. For diseases, extract ALL mentioned diseases as an array.
4. For tissues, extract ALL mentioned specimen/tissue types as an array.
5. For libraryKits, extract ALL mentioned kit names as an array.
6. Return ONLY valid JSON. No explanation or markdown.

## Field Guide

- subjectCount: Total participants. Sum groups if multiple (e.g. "20 patients + 10 controls" → 30). null if unclear.
- subjectCountType: "individual" if counting people, "sample" if counting specimens, "mixed" if both.
- healthStatus: "affected" if disease mentioned, "healthy" if only controls, "mixed" if both.
- diseases: ALL diseases. label in English, icd10 only if explicitly stated in text.
- tissues: ALL specimen/tissue types mentioned (e.g. ["skin", "PBMC"]). Empty [] if none.
- isTumor: true if tumor/cancer tissue, false if normal, null if unclear.
- cellLine: Array of cell line names if used (e.g. ["HeLa", "HepG2"]). Empty [] if none.
- population: Array of population/ethnicity if stated (e.g. ["Japanese", "East Asian"]). Check externalMetadata TITLE/DESCRIPTION. Empty [] if not stated.
- sex: "male" if only male subjects, "female" if only female, "mixed" if both mentioned. null if not stated.
- ageGroup: Age category of subjects. Use:
  - "infant" (0-1 years)
  - "child" (2-17 years)
  - "adult" (18-64 years)
  - "elderly" (65+ years)
  - "mixed" if multiple age groups mentioned
  - null if not stated
- assayType: Array of experimental methods as written (e.g. ["RNA-seq", "WGS"], ["ChIP-seq", "ATAC-seq"]). Empty [] if not stated.
- libraryKits: ALL library prep kit names. Empty [] if none.
- platforms: Array of platform objects with vendor and model. Extract ALL platforms if multiple used.
  Example: [{ "vendor": "Illumina", "model": "NovaSeq 6000" }, { "vendor": "Thermo Fisher", "model": "Ion Proton" }]
  Empty [] if none stated.
- readType: "single-end" or "paired-end". null if not stated.
- readLength: Read length in bp (number only). null if not stated.
- sequencingDepth: Average sequencing depth/coverage as number (e.g. "30x" → 30, "168x" → 168). Look in "Coverage" field. null if not stated.
- targetCoverage: Target region coverage percentage as number (e.g. "95%" → 95). null if not stated.
- referenceGenome: Array of reference genome versions as stated (e.g. ["GRCh38"], ["hg19", "hg38"]). Look in "Reference Sequence" field. Empty [] if not stated.
- variantCounts: Variant counts by type. Look in "SNV Number", "INDEL Number", "CNV Number", "SV Number", "Total Number of Variants" fields.
  - snv: SNV count (number or null)
  - indel: INDEL count (number or null)
  - cnv: CNV count (number or null)
  - sv: SV count (number or null)
  - total: Total variant count (number or null)
  - Return null for the entire object if no variant counts mentioned.
- hasPhenotypeData: true if phenotype/clinical data mentioned (e.g. "phenotype", "clinical", "disease characteristics"). false if explicitly stated no phenotype data. null if unclear.
- targets: Target/capture regions as written. null if not stated.
- fileTypes: Raw file formats (e.g. ["FASTQ", "BAM"]). Empty [] if none.
- processedDataTypes: Processed/derived data formats. Look in "Total Data Volume" or data descriptions. Common values: "fastq", "bam", "vcf", "cram", "gvcf". Empty [] if none.
- dataVolumeGb: Total data volume in GB. Convert from original unit (e.g. "1.5 TB" → 1536, "500 MB" → 0.5, "100 GB" → 100). null if not stated.

## Example

Input:
{
  "en": {
    "header": { "text": "JGAS000100" },
    "data": {
      "Materials and Participants": {
        "text": "Lung cancer (ICD10: C34): 50 adult male cases\\ntumor tissue: 50 samples\\n10 Healthy female controls\\nperipheral blood: 10 samples"
      },
      "Experimental Method": { "text": "WGS" },
      "Platform": { "text": "Illumina [NovaSeq 6000]" },
      "Read Type": { "text": "paired-end" },
      "Read Length": { "text": "150 bp" },
      "Library Construction": { "text": "TruSeq DNA PCR-Free Library Prep Kit" },
      "Coverage": { "text": "30x average depth" },
      "Reference Sequence": { "text": "GRCh38" },
      "SNV Number": { "text": "5,000,000" },
      "Total Data Volume": { "text": "VCF: 1.5 TB" }
    },
    "footers": []
  },
  "ja": null,
  "externalMetadata": {
    "TITLE": "WGS data of lung cancer in Japanese population",
    "DESCRIPTION": "Whole genome sequencing of lung cancer samples with phenotype data"
  }
}

Output:
{
  "subjectCount": 60,
  "subjectCountType": "individual",
  "healthStatus": "mixed",
  "diseases": [{ "label": "lung cancer", "icd10": "C34" }],
  "tissues": ["tumor tissue", "peripheral blood"],
  "isTumor": true,
  "cellLine": [],
  "population": ["Japanese"],
  "sex": "mixed",
  "ageGroup": "adult",
  "assayType": ["WGS"],
  "libraryKits": ["TruSeq DNA PCR-Free Library Prep Kit"],
  "platforms": [{ "vendor": "Illumina", "model": "NovaSeq 6000" }],
  "readType": "paired-end",
  "readLength": 150,
  "sequencingDepth": 30,
  "targetCoverage": null,
  "referenceGenome": ["GRCh38"],
  "variantCounts": { "snv": 5000000, "indel": null, "cnv": null, "sv": null, "total": null },
  "hasPhenotypeData": true,
  "targets": null,
  "fileTypes": [],
  "processedDataTypes": ["vcf"],
  "dataVolumeGb": 1536
}

Input:
`
