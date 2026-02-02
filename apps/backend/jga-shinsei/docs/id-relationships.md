# JGA ID の種類と関係

## ID 一覧

| ID | 形式 | 種類 | 説明 |
|----|------|------|------|
| hum_id | hum0273 | Research | NBDC 研究 ID |
| JSUB | JSUB000481 | Internal | JGA 内部 Submission ID（非公開） |
| JGA | JGA000123 | Submission | JGA 登録単位（公開 ID） |
| JGAS | JGAS000123 | Study | 研究 |
| JGAD | JGAD000123 | Dataset | データセット |
| JGAN | JGAN000123 | Sample | サンプル |
| JGAX | JGAX000123 | Experiment | 実験 |
| JGAR | JGAR000123 | Data/Run | データファイル |
| JGAZ | JGAZ000123 | Analysis | 解析結果 |
| J-DS | J-DS002504 | Application | データ提供申請 |
| J-DU | J-DU006529 | Application | データ利用申請 |

## 主要 ID の概念説明

### JSUB (Internal Submission ID)

JGA へのデータ登録時に割り当てられる内部 ID。

```
[登録]          [内部処理]        [公開]
   |                |                |
   v                v                v
JSUB000XXX  --->  審査中  --->  JGA000XXX
(内部ID)                        (公開ID)
```

- データ提出時に JSUB が発行される
- 審査・処理を経て、公開時に JGA ID が発行される
- JSUB は公開されない内部管理用 ID
- 公開前でも hum_id や J-DS との紐付けに使用される

### J-DS (Data Submission / データ提供申請)

研究者がデータを JGA に**提供（登録）**するための申請。

- 「このデータを JGA に登録させてください」という申請
- **データ提供者**側が申請する
- NBDC ヒトデータ審査委員会が審査
- 承認されるとデータ登録が可能になる

### J-DU (Data Use / データ利用申請)

他の研究者が JGA のデータを**利用**するための申請。

- 「この Dataset を使わせてください」という申請
- **データ利用者**側が申請する
- 特定の JGAD (Dataset) に対して申請する
- 承認されるとデータへのアクセスが許可される

### データの流れ

```
[データ提供者]                              [データ利用者]
     |                                           |
     v                                           v
  J-DS 申請                                  J-DU 申請
     |                                           |
     v                                           v
  審査・承認                                 審査・承認
     |                                           |
     v                                           v
データ登録 (JSUB -> JGA)              データアクセス許可 (JGAD)
```

## ID 間の関係

### グラフ構造

#### 1. JGA ID の階層構造 (relation table)

```
JGA (Submission)
 |
 +-- JGAS (Study)
 |    |
 |    +-- JGAD (Dataset)
 |    |    |
 |    |    +-- JGAX (Experiment)
 |    |    |    |
 |    |    |    +-- JGAR (Data/Run)
 |    |    |
 |    |    +-- JGAN (Sample)
 |    |
 |    +-- JGAZ (Analysis)
```

#### 2. JSUB <-> JGA IDs (alias)

```
JSUB  <------>  JGA, JGAS, JGAD, ...
        alias
```

- `accession.alias` に JSUB ID が格納されている

#### 3. JSUB/JGA <-> hum_id (metadata XML)

```
JSUB/JGA  ------>  metadata.xml  ------>  hum_id
           1:1      nbdc_number
```

- `metadata.metadata` XML 内の `nbdc_number` 属性から抽出

#### 4. J-DS <-> submission (submission_permission)

```
J-DS  <------>  submission
  submission_permission
```

- `submission_permission` テーブルで直接紐付け
- J-DS の `appl_id` と `submission_id` で 1:1 対応

#### 5. J-DU -> JGAD (use_permission)

```
J-DU  ------>  JGAD
  use_permission.dataset_id
```

- データ利用申請は特定の Dataset に対して発行される

### リンクの種類と経路

#### 直接リンク（Direct Links）

| From | To | 経路 | テーブル |
|------|----|------|----------|
| JSUB | JGA IDs | `accession.alias` に JSUB ID が格納 | `accession` |
| JSUB | hum_id | `metadata.metadata` XML の `nbdc_number` 属性 | `accession` -> `metadata` |
| JGA | hum_id | 同上（JSUB 経由と同じデータ） | `accession` -> `metadata` |
| J-DU | JGAD | `use_permission.dataset_id` | `nbdc_application` -> `use_permission` -> `accession` |

#### J-DS から JGA IDs への経路

```
J-DS --[appl_id]--> submission_permission --[submission_id]--> submission
                                                                    |
                                                              [submission_id]
                                                                    v
                                                                  entry
                                                                    |
                                                              [entry_id]
                                                                    v
                                                                relation
                                                                    |
                                                               [self]
                                                                    v
                                                             accession (JGA IDs)
```

## 重要な設計ポイント

1. **JSUB は非公開内部 ID**: `accession.alias` に格納され、公開されない
2. **submission_permission が J-DS と submission を直接紐付け**: 1 対 1 で正確な紐付け
3. **hum_id は XML から正規表現抽出**: `nbdc_number="..."` 属性
4. **J-DU は Dataset 単位で申請**: JGAD に直接紐付く（`use_permission`）
5. **relation テーブルが階層管理**: self/parent で JGA ID の親子関係を表現

## relations.json の構造

`dump-all-data.sh` で出力される `relations.json` は、直接的なリレーションのみを保持する 5 テーブル構成。導出可能な関係は `fetch-relation.sh` で計算する。

### 5 テーブル

| テーブル | 内容 | フィールド |
|----------|------|------------|
| `jga_hierarchy` | JGA ID 親子関係 | `child`, `parent`, `child_type`, `parent_type` |
| `jga_to_hum` | JGA ↔ hum_id | `jga_accession`, `hum_id` |
| `jsub_to_jga` | JSUB ↔ JGA ID | `jsub_id`, `type`, `jga_accession` |
| `jds_to_jga` | J-DS ↔ JGA | `jds_id`, `jga_accession` |
| `jdu_to_jgad` | J-DU ↔ JGAD | `jdu_id`, `jgad_accession` |

### JSON 例

```json
{
  "jga_hierarchy": [
    { "child": "JGAD000369", "parent": "JGAS000001", "child_type": "JGAD", "parent_type": "JGAS" }
  ],
  "jga_to_hum": [
    { "jga_accession": "JGA000404", "hum_id": "hum0273" }
  ],
  "jsub_to_jga": [
    { "jsub_id": "JSUB000481", "type": "Analysis", "jga_accession": "JGAZ000004502" }
  ],
  "jds_to_jga": [
    { "jds_id": "J-DS002527", "jga_accession": "JGA000442" }
  ],
  "jdu_to_jgad": [
    { "jdu_id": "J-DU006527", "jgad_accession": "JGAD000410" }
  ]
}
```

完全なサンプルは [`json-data-example/relations.json`](../json-data-example/relations.json) を参照。

### 導出ロジック

以下の関係は直接テーブルに保持せず、`fetch-relation.sh` で JGA ID を経由して計算する：

| 取得したい関係 | 導出方法 |
|----------------|----------|
| JSUB → hum_id | `jsub_to_jga` で JGA 取得 → `jga_to_hum` で hum_id 取得 |
| JSUB → J-DS | `jsub_to_jga` で JGA 取得 → `jds_to_jga` 逆引きで J-DS 取得 |
| hum_id → JSUB | `jga_to_hum` 逆引きで JGA 取得 → `jsub_to_jga` 逆引きで JSUB 取得 |
| J-DS → JSUB | `jds_to_jga` で JGA 取得 → `jsub_to_jga` 逆引きで JSUB 取得 |

## 注意事項

- **JSUB と J-DU の紐付けは行わない**: JSUB は Submission（データ提供）側、J-DU は Data Use（データ利用）側で、直接的な関係がない
- **group_id 経由の紐付けは非推奨**: 多対多になり正確な紐付けができないため使用しない
- **hum_id の取得**: 現在は `metadata.metadata` XML の `nbdc_number` 属性から抽出。`nbdc_application.hum_id` は将来拡充予定（現在はほぼ未入力）
