# LLM フィールド抽出

クローラーパイプラインの Step 6 で、Ollama LLM を使って実験テーブルから検索可能フィールド（`searchable`）を抽出する。

## 概要

### 目的

HumanDBs ポータルサイトの実験データから、ファセット検索に必要なメタデータを自動抽出する。

### パイプライン内の位置

```
Step 4: structure
    ↓
Step 5: enrich (外部 API メタデータ付与)
    ↓
Step 6: llm-extract (このステップ)
    ↓ experiments[].searchable に追加
Step 7: icd10-normalize (diseases[].icd10 を正規化)
    ↓
Step 9: facet-normalize (assayType, tissues 等を正規化)
```

### 入出力

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/structured-json/dataset/*.json` |
| 出力 | 同ファイルの `experiments[].searchable` フィールド |
| モデル | Ollama (デフォルト: 環境変数 `OLLAMA_MODEL`) |

## 抽出フィールド一覧

### SearchableExperimentFields

| フィールド | 型 | 説明 | 抽出方法 |
|-----------|-----|------|---------|
| subjectCount | number \| null | 被験者/サンプル数。複数グループは合算 | LLM |
| subjectCountType | enum \| null | "individual" / "sample" / "mixed" | LLM |
| healthStatus | enum \| null | "healthy" / "affected" / "mixed" | LLM |
| diseases | DiseaseInfo[] | 疾患情報。label(英語) + icd10(明記時のみ) | LLM + icd10-normalize |
| tissues | string[] | 組織・検体種別（英語） | LLM + facet-normalize |
| isTumor | boolean \| null | 腫瘍組織かどうか | LLM |
| cellLine | string[] | 細胞株名 | LLM |
| population | string[] | 集団・民族 | LLM |
| sex | enum \| null | "male" / "female" / "mixed" | LLM |
| ageGroup | enum \| null | "infant" / "child" / "adult" / "elderly" / "mixed" | LLM |
| assayType | string[] | 実験手法 | LLM + facet-normalize |
| libraryKits | string[] | ライブラリキット名 | LLM |
| platforms | PlatformInfo[] | プラットフォーム（vendor + model） | LLM |
| readType | enum \| null | "single-end" / "paired-end" | LLM |
| readLength | number \| null | リード長（bp） | LLM |
| sequencingDepth | number \| null | シーケンシング深度（例: 30x → 30） | LLM |
| targetCoverage | number \| null | ターゲットカバレッジ（%） | LLM |
| referenceGenome | string[] | リファレンスゲノム | LLM |
| variantCounts | VariantCounts \| null | バリアント数（snv/indel/cnv/sv/total） | LLM |
| hasPhenotypeData | boolean \| null | 表現型データの有無 | LLM |
| targets | string \| null | ターゲット領域 | LLM |
| fileTypes | string[] | ファイル形式（FASTQ, BAM など） | LLM |
| processedDataTypes | string[] | 処理済みデータ形式（vcf, cram など） | LLM |
| dataVolumeGb | number \| null | データ容量（GB） | LLM |
| policies | NormalizedPolicy[] | ポリシー情報 | **ルールベース**（LLM 不使用） |

### 補助型

```typescript
interface DiseaseInfo {
  label: string      // 疾患名（英語）
  icd10: string | null  // ICD-10 コード（明記時のみ）
}

interface PlatformInfo {
  vendor: string  // 例: "Illumina"
  model: string   // 例: "NovaSeq 6000"
}

interface VariantCounts {
  snv: number | null
  indel: number | null
  cnv: number | null
  sv: number | null
  total: number | null
}
```

## 抽出フロー

```
experiments[].data (実験テーブル)
  + experiments[].header
  + externalMetadata (JGA/DRA API)
           ↓
    LLM プロンプトに入力
           ↓
    LLM が JSON 出力
           ↓
experiments[].searchable に格納
           ↓
    Step 7: icd10-normalize
      diseases[].icd10 を正規化
           ↓
    Step 9: facet-normalize
      assayType, tissues 等を正規化
```

## プロンプト設計

### 入力形式

```json
{
  "en": {
    "header": { "text": "JGAS000100" },
    "data": {
      "Materials and Participants": { "text": "..." },
      "Experimental Method": { "text": "..." },
      ...
    },
    "footers": []
  },
  "ja": { ... },
  "externalMetadata": {
    "TITLE": "...",
    "DESCRIPTION": "..."
  }
}
```

### プロンプトの主要ルール

1. **全テキストは英語で出力**: 日本語は英訳する
2. **翻訳のみ、正規化しない**: "Life Technologies" → "Thermo Fisher" に変換しない
3. **存在する情報のみ抽出**: 推測しない。不明な場合は `null` または `[]`
4. **複数値は配列で返す**: diseases, tissues, assayType など
5. **ICD-10 は明記時のみ**: テキストに明示的に記載されている場合のみ抽出

### 出力例

```json
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
```

## 正規化の方針

### LLM がやること（翻訳）

- 日本語のフィールド値を英語に翻訳
- 例: "末梢血" → "peripheral blood", "腫瘍組織" → "tumor tissue"

### LLM がやらないこと（正規化）

- 同義語の統一は後段ステップ（facet-normalize）で行う
- 例: "RNA-Seq" / "RNAseq" / "mRNA-Seq" の統一は TSV マッピングで

### 理由

- 誤った変換による情報損失リスク
- 正規化ルールの更新が LLM プロンプト変更を要求
- 正規化は domain knowledge が必要で、人間が適切に判断できる

## フィールド追加の手順

新しい searchable フィールドを追加する場合:

### 1. 型定義を追加

`src/crawler/types/structured.ts`:

```typescript
// SearchableExperimentFields に追加
newField: string | null
```

### 2. ES スキーマを追加

`src/es/types.ts`:

```typescript
// SearchableExperimentFieldsSchema に追加
newField: z.string().nullable(),
```

`src/es/dataset-schema.ts`:

```typescript
// searchable オブジェクト内に追加
newField: f.keyword(),
```

### 3. プロンプトを追加

`src/crawler/llm/prompts.ts`:

```typescript
// Field Guide セクションに追加
- newField: Description of what to extract. null if not stated.
```

### 4. 抽出ロジックを追加（必要に応じて）

`src/crawler/llm/extract.ts`:

デフォルトでは LLM 出力がそのまま使用される。特別な変換が必要な場合のみ追加。

### 5. 正規化ルールを追加（必要に応じて）

ファセット検索用に値を統一する場合:

1. `src/crawler/data/facet-mappings/newField.tsv` を作成
2. `src/crawler/cli/facet-values.ts` に収集対象を追加
3. `src/crawler/cli/facet-normalize.ts` に正規化対象を追加

## 実行コマンド

```bash
# 全データセット処理
bun run crawler:llm-extract

# 特定の humId のみ
bun run crawler:llm-extract --hum-id hum0001

# 特定のファイルのみ
bun run crawler:llm-extract --file JGAD000001-v1.json

# 強制再抽出（既存フィールド上書き）
bun run crawler:llm-extract --force

# ドライラン（LLM 呼び出しなし）
bun run crawler:llm-extract --dry-run
```

## トラブルシューティング

### LLM が不正な JSON を返す

- Ollama モデルのバージョンを確認
- `--dry-run` でデバッグ
- 長い入力テキストをトリミングする

### 既存フィールドがスキップされる

- `--force` で再抽出

### policies が抽出されない

- policies はルールベースで抽出されるため LLM 不使用
- `src/crawler/processors/policies.ts` を確認
