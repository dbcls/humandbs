# LLM Extract 設計ノート

## 背景

HumanDBs ポータルサイトの研究データベース情報を検索可能にするため、Crawler パイプラインの Step 6 で Ollama LLM を使い、実験テーブル (Experiment) から構造化メタデータを抽出する。

本ドキュメントは、検索ユースケースから逆算してどのようなフィールドを抽出すべきかを整理したもの。

## 検索ユースケース

### 想定ユーザー

主に生命科学の研究者。自分の研究に利用可能なデータセットを探すために検索する。

### 検索シナリオ

| # | シナリオ | ユーザーの問い | 必要なフィールド | 備考 |
|---|---------|-------------|---------------|------|
| A | 疾患名検索 | 「がん関連のデータセットを探したい」 | diseases (疾患名 + ICD-10) | 最重要。同義語問題あり |
| B | アッセイ絞込 | 「RNA-seq のデータだけ見たい」 | assayType | 表記揺れあり (RNA-seq/RNA-Seq/RNAseq) |
| C | プラットフォーム | 「Illumina のデータ」 | platformVendor, platformModel | |
| D | アクセス区分 | 「制限なしのデータだけ」 | criteria | LLM 抽出不要。既存フィールド |
| E | 組織・検体 | 「血液サンプルのデータ」 | tissues | 複数組織の記載が頻出 |
| F | データ規模 | 「被験者100人以上のデータ」 | totalSubjectCount | 重複カウント問題あり |
| G | ファセット集計 | 疾患別件数、アッセイ別件数 | 全 keyword 型フィールド | ES aggregations で実現 |
| H | フリーテキスト | 「アトピー」で検索 | 全テキストフィールド | ES mapping 改善必要 |
| I | 集団・民族 | 「Japanese population」 | population | externalMetadata にまれに記載 |
| J | 年齢層 | 「小児のデータ」 | ageGroup | 実データにほぼ記載なし |
| K | 地域 | 「沖縄のデータ」 | region | 実データに記載なし |

### 類似 DB の検索機能（参考）

| DB | 主要ファセット |
|----|-------------|
| GDC (NCI) | Experimental Strategy, Data Category, Platform, Tissue Type, Specimen Type, Access |
| dbGaP (NCBI) | Disease (MeSH), Molecular Data Type, Genotype Platform, Study Design, Consent Type |
| EGA (EU) | study_type, dataset_types, dataset_technologies, samples 範囲, DUO codes |
| JGA (DDBJ) | Type of Study, Platform, Participants/Materials, Type of Data |

## 抽出フィールド設計

### 設計方針

1. **翻訳はする、正規化はしない**: LLM は日本語→英語の翻訳を行うが、同義語の統一（正規化）は TSV 手動編集で行う
2. **存在する情報のみ抽出**: テキストに記載されていない情報を推測させない
3. **検索に使えるフィールドを優先**: ファセット検索で実用的な粒度を重視

### 実データ調査結果

10件の enriched dataset を分析し、各情報の記載状況を調査した。

| 情報 | 実験テーブル | externalMetadata | LLM 抽出 | 備考 |
|------|------------|-----------------|---------|------|
| 疾患名 | ◎ ほぼ全件 | ○ TITLE に含む場合あり | ✅ 対応 | ICD-10 は明記時のみ |
| 検体種別 | ◎ 複数記載あり | △ | ✅ 対応 (配列化) | 皮膚+PBMC等の混在が頻繁 |
| アッセイ | ◎ ほぼ全件 | ○ | ✅ 対応 | |
| プラットフォーム | ◎ ほぼ全件 | △ | ✅ 対応 | |
| ライブラリキット | ○ 記載あり | ✗ | ✅ 対応 (配列化) | 組織別に異なるキット |
| データ量 | ○ 記載あり | ✗ | ✅ 対応 | |
| 集団・民族 | ✗ ほぼなし | △ まれに記載 | ✅ 試行 | 大半が null になる見込み |
| 年齢 | ✗ 1件のみ (AYA世代) | ✗ | ❌ 手動追加 | |
| 地域 | ✗ 記載なし | ✗ | ❌ 手動追加 | |
| 性別 | ✗ ほぼなし | ✗ | ❌ 手動追加 | |

### フィールド一覧

#### LLM 抽出フィールド（実験レベル）

| フィールド | 型 | 変更 | 説明 |
|-----------|-----|------|------|
| subjectCount | number \| null | — | 被験者数。複数グループは合算 |
| subjectCountType | enum \| null | — | individual/sample/mixed |
| healthStatus | enum \| null | — | healthy/affected/mixed |
| diseases | DiseaseInfo[] | — | 疾患名(英語) + ICD-10(明記時のみ) |
| tissues | string[] | 配列化 | 組織・検体種別(英語)。複数対応 |
| isTumor | boolean \| null | — | 腫瘍組織かどうか |
| cellLine | string \| null | — | 細胞株名 |
| population | string \| null | 新規 | 集団・民族(externalMetadata参照) |
| assayType | string \| null | — | アッセイ種別(翻訳のみ、正規化なし) |
| libraryKits | string[] | 配列化 | ライブラリキット名。複数対応 |
| platformVendor | string \| null | — | シーケンサー製造元 |
| platformModel | string \| null | — | シーケンサー機種名 |
| readType | enum \| null | — | single-end/paired-end |
| readLength | number \| null | — | リード長(bp) |
| targets | string \| null | — | ターゲット領域 |
| fileTypes | string[] | — | ファイル形式 |
| dataVolume | DataVolume \| null | — | データサイズ |

#### データセット集約フィールド

| フィールド | 型 | 集約方法 |
|-----------|-----|---------|
| diseases | DiseaseInfo[] | 全実験から重複排除 |
| tissues | string[] | 全実験から重複排除 |
| populations | string[] | 全実験から重複排除 |
| assayTypes | string[] | 全実験から重複排除 |
| platforms | PlatformInfo[] | vendor+model で重複排除 |
| readTypes | string[] | 全実験から重複排除 |
| fileTypes | string[] | 全実験から重複排除 |
| totalSubjectCount | number \| null | 全実験の合算 |
| totalDataVolume | DataVolume \| null | GB換算で合算 |
| hasHealthyControl | boolean | いずれかの実験に健常者含む |
| hasTumor | boolean | いずれかの実験に腫瘍含む |
| hasCellLine | boolean | いずれかの実験に細胞株含む |

#### 手動キュレーションフィールド（TSV 列として追加、LLM 抽出対象外）

| フィールド | 型 | 用途 | 理由 |
|-----------|-----|------|------|
| ageGroup | string \| null | 年齢層フィルタ(小児/成人/高齢者) | 実データにほぼ記載なし |
| region | string \| null | 地域フィルタ(沖縄等) | 実データに記載なし |
| sex | string \| null | 性別フィルタ | 実データにほぼ記載なし |

これらは TSV export 時に空欄の列として出力し、人間が知見に基づいて記入する。

## 正規化の方針

### LLM がやること（翻訳）

- 日本語のフィールド値を英語に翻訳
- 例: "末梢血" → "peripheral blood", "腫瘍組織" → "tumor tissue"

### 人間がやること（正規化）

LLM の出力には表記揺れが残る。以下は TSV 手動編集で統一する:

- assayType: "RNA-Seq" / "RNAseq" / "mRNA-Seq" → "RNA-seq"
- platformVendor: "Life Technologies" → "Thermo Fisher Scientific"
- tissue: "blood" / "whole blood" / "peripheral blood" の使い分け
- disease label: "lung cancer" / "non-small cell lung cancer" の粒度

LLM に正規化させない理由:
- 誤った変換による情報損失リスク（例: "Ion PGM" を "Thermo Fisher" に変換するのは正しいが、文脈によっては不適切）
- 正規化ルールの更新が LLM プロンプトの変更を要求する（人間が TSV で行えば柔軟）
- 正規化は domain knowledge が必要で、LLM より人間が適切に判断できる

## 配列化の根拠

### tissues (tissue → tissues)

実データで確認された複数組織パターン:
- JGAD000922: 「皮膚検体およびPBMC検体から抽出したRNA」→ skin, PBMC
- JGAD000277: 「腫瘍組織および非腫瘍組織」→ tumor tissue, non-tumor tissue

### libraryKits (libraryKit → libraryKits)

実データで確認された複数キットパターン:
- JGAD000922: 「皮膚: NEBNext Ultra RNA Library Prep Kit / PBMC: SureSelect Strand-Specific RNA Library Prep Kit」
- JGAD000464: 「TruSeq RNA Library Prep Kit v2」と「TruSeq Stranded mRNA Library Prep Kit」

### 据置としたフィールド

| フィールド | 据置理由 |
|-----------|---------|
| assayType | 1実験テーブル = 1手法がほとんど |
| cellLine | 複数セルラインの例が少ない |
| platformModel | 異なる機種は別の実験テーブルに分かれる |
