# ICD10 Disease Normalization

疾患名と ICD10 コードの正規化を行うためのマッピングデータ。

## 目的

LLM が抽出した疾患情報を以下の形式に正規化する:

- **label**: ICD10 マスターに基づく英語疾患名
- **icd10**: 有効な ICD10 コード（単一値、必須）

## ファイル構成

マッピングデータは `src/crawler/data/icd10/` に格納:

| ファイル | Git 管理 | 説明 |
|----------|----------|------|
| `icd10-disease-mapping.json` | ✓ | 疾患の正規化マッピング（メイン）|
| `disease-split-rules.json` | ✓ | 複数疾患の分割ルール |
| `disease-exclude.json` | ✓ | 出力から除外する非疾患ラベル |
| `icd10-labels.json` | ✗ | ICD10 コード -> 英語ラベルのマスター（自動生成）|
| `icd10-master.txt` | ✗ | WHO ICD10 マスターファイル（生成元）|

## 正規化ロジック

`crawler:icd10-normalize` コマンドは以下の順序で疾患を正規化する:

### 1. 分割ルールの適用

`disease-split-rules.json` をチェック。複数の ICD10 コードを持つ疾患を分割。

```json
{
  "大腸・直腸がん(C189, C20)": [
    { "label": "大腸がん", "icd10": "C189" },
    { "label": "直腸がん", "icd10": "C20" }
  ]
}
```

**重要**: 各疾患は単一の ICD10 コードを持つ。複数コードの場合は分割ルールで処理。

### 2. ラベルから ICD10 を抽出

`乳がん(C509)` のようなパターンから ICD10 コードを抽出。

### 3. マッピングの適用

`icd10-disease-mapping.json` から `label|icd10` キーで検索し、正規化された値を取得。

```json
{
  "breast cancer|C509": {
    "label": "Malignant neoplasm: Breast, unspecified",
    "icd10": "C509"
  }
}
```

### 4. 未マッピングの警告

マッピングがない場合、以下のケースで警告を出力:

- 日本語ラベル
- ICD10 なし
- 範囲コード（例: C18-C21）またはドット付きコード（例: C34.1）
- 複数 ICD10 コードで分割定義なし

## 新しい疾患が出た場合の対応

LLM モデルを変更した場合など、新しい疾患パターンが出現する可能性がある。

### 警告メッセージと対応方法

| 警告 | 対応 |
|------|------|
| `Unmapped Japanese disease: "..."` | `icd10-disease-mapping.json` に追加 |
| `Unmapped disease without ICD10: "..."` | `icd10-disease-mapping.json` に追加 |
| `Disease with range/invalid ICD10: "..."` | `icd10-disease-mapping.json` に追加 |
| `Multiple ICD10 codes without split definition: "..."` | `disease-split-rules.json` に追加 |

### 手順

1. `bun run crawler:icd10-normalize -- --dry-run` を実行して警告を確認
2. 適切なファイルにマッピングを追加
3. 再度 `--dry-run` で確認
4. `bun run crawler:icd10-normalize` で実行

### icd10-disease-mapping.json の編集

キー: `label|icd10`（ICD10 がない場合は `label|`）

```json
{
  "new disease|": {
    "label": "Proper English disease name",
    "icd10": "X999"
  },
  "日本語疾患名|C123": {
    "label": "English disease name",
    "icd10": "C123"
  }
}
```

### disease-split-rules.json の編集

複数の ICD10 コードを持つ疾患を分割:

```json
{
  "複合疾患名(A01, B02)": [
    { "label": "疾患A", "icd10": "A01" },
    { "label": "疾患B", "icd10": "B02" }
  ]
}
```

## ICD10 コードの検索

ICD10 コードが分からない場合:

1. <https://icdcdn.who.int/icd10/index.html> で検索
2. WHO ICD10 ブラウザで疾患名を検索

## 除外リスト

`disease-exclude.json` に定義された値は疾患名ではなく、出力から除外される:

- `47 diseases`（具体的な疾患名ではない）
- `undiagnosed disease`
- `eHHV-6B-positive`, `eHHV-6B-negative`（ウイルス陽性/陰性）
- `血糖・脂質関連`, `腎機能`, `肝機能`（検査項目）

新しい除外対象を追加する場合は、`disease-exclude.json` に追加する。

## icd10-labels.json の生成

`icd10-labels.json` は WHO ICD10 マスターから自動生成される。Git 管理外のため、初回実行時に生成が必要。

### 生成手順

1. WHO ICD10 マスターファイルをダウンロード:

   ```bash
   # https://icdcdn.who.int/icd10/index.html から ZIP をダウンロード
   curl -O https://icdcdn.who.int/icd10/meta/icd102019enMeta.zip
   unzip icd102019enMeta.zip
   # 展開されるファイル:
   #   icd102019syst_chapters.txt  - 章の定義
   #   icd102019syst_codes.txt     - コードとラベル（これを使用）
   #   icd102019syst_groups.txt    - グループの定義
   cp icd102019syst_codes.txt src/crawler/data/icd10/icd10-master.txt
   ```

2. マスターファイルを JSON に変換:

   ```bash
   cd src/crawler/data/icd10
   # セミコロン区切りの8番目(コード)と9番目(ラベル)を抽出してJSONに変換
   echo '{' > icd10-labels.json
   awk -F';' 'NF>=9 && $8 ~ /^[A-Z][0-9]/ {gsub(/"/, "\\\"", $9); printf "  \"%s\": \"%s\",\n", $8, $9}' icd10-master.txt | sed '$ s/,$//' >> icd10-labels.json
   echo '}' >> icd10-labels.json
   ```

### icd10-master.txt のフォーマット

セミコロン区切りで、8番目がコード（ドットなし）、9番目が英語ラベル:

```plaintext
4;T;X;01;A00;A00.0;A00.0;A000;Cholera due to Vibrio cholerae 01, biovar cholerae;...
```

### icd10-labels.json の形式

```json
{
  "A000": "Cholera due to Vibrio cholerae 01, biovar cholerae",
  "C509": "Malignant neoplasm: Breast, unspecified",
  ...
}
```

約 10,000 件の ICD10 コードとその英語ラベルが含まれる。
