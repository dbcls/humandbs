# HumanDBs 検索機能仕様

## 1. 概要

HumanDBs は、生命科学分野の研究データベース情報を検索・閲覧するためのシステムである。

### 対象リソース

| リソース | 説明 |
|---------|------|
| Research | 研究プロジェクト単位の情報 |
| Dataset | データセット単位の詳細情報 |

## 2. 検索機能

### 2.1 ファセット検索 (絞り込み)

カテゴリ値による絞り込み検索ができる。

#### Dataset

| フィールド | 意味 |
|-----------|------|
| criteria | アクセス種別 |
| subjectCountType | 被験者数の種別 (individual/sample/mixed) |
| healthStatus | 健康状態 (healthy/affected/mixed) |
| disease | 疾患名（部分一致検索） |
| diseaseIcd10 | ICD-10 コード（前方一致） |
| tissues | 組織・サンプル種別 |
| cellLine | 細胞株名 |
| population | 母集団・民族 |
| sex | 性別 (male/female/mixed) |
| ageGroup | 年齢層 (infant/child/adult/elderly/mixed) |
| assayType | 実験手法 |
| libraryKits | ライブラリキット |
| platform | プラットフォーム (`{vendor} \|\| {model}` 形式) |
| readType | リードタイプ (single-end/paired-end) |
| referenceGenome | 参照ゲノム |
| fileTypes | ファイル形式 |
| processedDataTypes | 加工済みデータ形式 |
| policyId | ポリシー ID |

### 2.2 Boolean フィルター

真偽値による絞り込み検索ができる。

#### Dataset

| フィールド | 意味 |
|-----------|------|
| isTumor | 腫瘍組織か |
| hasPhenotypeData | 表現型データの有無 |

### 2.3 Range フィルター (数値範囲)

数値フィールドに対する範囲指定ができる。

#### Research

| フィールド | 意味 |
|-----------|------|
| datePublished | 初回リリース日 |
| dateModified | 最終リリース日 |

#### Dataset

| フィールド | 意味 |
|-----------|------|
| releaseDate | リリース日 |
| subjectCount | 被験者数 |
| readLength | リード長 |
| sequencingDepth | シーケンス深度 |
| targetCoverage | ターゲットカバー率 (%) |
| dataVolumeGb | データ容量 (GB) |
| variantCounts.snv | SNV 数 |
| variantCounts.indel | InDel 数 |
| variantCounts.cnv | CNV 数 |
| variantCounts.sv | SV 数 |
| variantCounts.total | 変異総数 |

### 2.4 フリーテキスト検索

自然文による全文検索ができる。

#### Research

| フィールド | 意味 |
|-----------|------|
| title | 研究タイトル |
| summary.aims.text | 研究目的 |
| summary.methods.text | 研究手法 |
| summary.targets.text | 研究対象 |

#### Dataset

| フィールド | 意味 |
|-----------|------|
| typeOfData | データ種別 |
| targets | ターゲット領域 |

### 2.5 複合検索例

```plaintext
例1: 日本人のがんの WGS で GRCh38 マッピング済み
-> diseases: *cancer* AND population: Japanese AND assayType: WGS AND referenceGenome: *GRCh38*

例2: 血液サンプルの RNA-seq で 1000人以上
-> tissues: *blood* AND assayType: RNA-seq AND subjectCount >= 1000

例3: 制限なしで使える高深度 WGS
-> criteria: Unrestricted-access AND sequencingDepth >= 30 AND assayType: WGS

例4: 表現型データ付きの糖尿病研究
-> diseases: *diabetes* AND hasPhenotypeData: true

例5: 「がん」を研究目的に含む研究
-> aims.text: がん (フリーテキスト検索)
```

## 3. 統計情報表示

### 3.1 サマリー統計 (総数など)

| 統計 | 内容 |
|------|------|
| 総研究数 | Research の件数 |
| 総データセット数 | Dataset の件数 |
| 総被験者数 | subjectCount の合計 |
| 総データ容量 | dataVolumeGb の合計 |

### 3.2 分布グラフ (カテゴリ別)

ファセット検索可能なフィールドはグラフ化できる。

| フィールド | 意味 |
|-----------|------|
| criteria | アクセス種別 |
| subjectCountType | 被験者数の種別 |
| healthStatus | 健康状態 |
| disease | 疾患名 |
| tissues | 組織・サンプル種別 |
| cellLine | 細胞株名 |
| population | 母集団・民族 |
| sex | 性別 |
| ageGroup | 年齢層 |
| assayType | 実験手法 |
| libraryKits | ライブラリキット |
| platform | プラットフォーム (`{vendor} \|\| {model}` 形式) |
| readType | リードタイプ |
| referenceGenome | 参照ゲノム |
| fileTypes | ファイル形式 |
| processedDataTypes | 加工済みデータ形式 |
| policyId | ポリシー ID |

### 3.3 数値分布 (ヒストグラム)

Range フィルター可能な数値フィールドはヒストグラム表示できる。

| フィールド | 意味 |
|-----------|------|
| releaseDate | リリース日 (年別推移) |
| subjectCount | 被験者数 |
| readLength | リード長 |
| sequencingDepth | シーケンス深度 |
| targetCoverage | ターゲットカバー率 |
| dataVolumeGb | データ容量 |
| variantCounts.snv | SNV 数 |
| variantCounts.indel | InDel 数 |
| variantCounts.cnv | CNV 数 |
| variantCounts.sv | SV 数 |
| variantCounts.total | 変異総数 |

## 4. フィールド仕様

### 4.1 共通規約

#### typeOfData と assayType の使い分け

| フィールド | レベル | 例 | 用途 |
|-----------|--------|-----|------|
| typeOfData | Dataset | `"NGS(RNA-seq)"`, `"40疾患のGWAS"` | フリーテキスト検索 (自由形式) |
| assayType | Experiment | `"RNA-seq"`, `"WGS"`, `"GWAS"` | ファセット検索 (構造化された値) |

両方維持する。用途が異なるため。

#### 数値フィールドの単位規約

| フィールド | 単位 | 備考 |
|-----------|------|------|
| dataVolumeGb | GB (float) | 人間に読みやすく、検索も直感的 (0.5 = 500MB) |
| sequencingDepth | 数値のみ | 単位 "x" は省略 (30, 168 など) |
| targetCoverage | パーセント | 単位 "%" は省略 (90, 95 など) |
| readLength | integer | 単位 "bp" は省略 (150, 250 など) |
| variantCounts | integer | そのまま |

#### platform フィールドの形式

プラットフォーム情報は vendor (製造元) と model (機種名) の2要素で構成される。

**内部保存形式 (ES)**:

- `platforms`: nested 型
  - `vendor`: keyword (例: `"Illumina"`, `"Thermo Fisher Scientific"`)
  - `model`: keyword (例: `"NovaSeq 6000"`, `"Ion PGM"`)
- vendor/model の対応関係を維持するため nested 型で保存

**API 形式**:

- ファセット一覧: `"{vendor}||{model}"` 形式で返す
  - 例: `"Illumina||NovaSeq 6000"`, `"Thermo Fisher Scientific||Ion PGM"`
  - ES の nested aggregation で `platforms` から抽出
- 検索クエリ: 同じ `"{vendor}||{model}"` 形式で指定
  - 例: `platform=Illumina||NovaSeq 6000`
- API 内部で `||` で分割して vendor/model に分解し、ES nested query で問い合わせる

**セパレータに `||` を採用した理由**:

- vendor 名に空白を含むケースがある (例: "Thermo Fisher Scientific")
- 単一スペースでの分割は不可能
- `||` は vendor/model 名に含まれない安全なセパレータ

### 4.2 Research フィールド

| フィールド | 型 | 意味 | 検索方法 |
|-----------|-----|------|---------|
| title | BilingualText | 研究タイトル | match |
| summary.aims.text | BilingualText | 研究目的 | match |
| summary.methods.text | BilingualText | 研究手法 | match |
| summary.targets.text | BilingualText | 研究対象 | match |
| datePublished | date | 初回リリース日 | range |
| dateModified | date | 最終リリース日 | range |

### 4.3 Dataset フィールド

#### トップレベル

| フィールド | 型 | 意味 | 検索方法 |
|-----------|-----|------|---------|
| criteria | keyword | アクセス種別 | term |
| releaseDate | date | リリース日 | range |
| typeOfData | BilingualText | データ種別 | match |

#### experiments.searchable

| フィールド | 型 | 意味 | 検索方法 |
|-----------|-----|------|---------|
| subjectCount | integer | 被験者数 | range |
| subjectCountType | keyword | individual/sample/mixed | term |
| healthStatus | keyword | healthy/affected/mixed | term |
| diseases | nested[] | 疾患 (label + ICD-10) | nested term |
| tissues | keyword[] | 組織・サンプル種別 | terms |
| isTumor | boolean | 腫瘍組織か | term |
| cellLine | keyword | 細胞株名 | term |
| population | keyword | 母集団・民族 | term |
| sex | keyword | 性別 (male/female/mixed) | term |
| ageGroup | keyword | 年齢層 (infant/child/adult/elderly/mixed) | term |
| assayType | keyword | 実験手法 | term |
| libraryKits | keyword[] | ライブラリキット | terms |
| platform | keyword[] | プラットフォーム (`{vendor} \|\| {model}` 形式) | terms |
| readType | keyword | single-end/paired-end | term |
| readLength | integer | リード長 | range |
| sequencingDepth | float | シーケンス深度 | range |
| targetCoverage | float | ターゲットカバー率 (%) | range |
| referenceGenome | keyword | 参照ゲノム | term |
| targets | text | ターゲット領域 | match |
| fileTypes | keyword[] | ファイル形式 | terms |
| processedDataTypes | keyword[] | 加工済みデータ形式 | terms |
| dataVolumeGb | float | データ容量 (GB) | range |
| variantCounts.snv | long | SNV 数 | range |
| variantCounts.indel | long | InDel 数 | range |
| variantCounts.cnv | long | CNV 数 | range |
| variantCounts.sv | long | SV 数 | range |
| variantCounts.total | long | 変異総数 | range |
| hasPhenotypeData | boolean | 表現型データの有無 | term |
| policies | nested[] | ポリシー | nested term |
