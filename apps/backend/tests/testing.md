# Testing Guide

Backend テストの方針と構成について説明する。

## テスト構成

`tests/unit/` 以下は `src/` のディレクトリ構成・ファイル名と対応させる。

```plaintext
src/
├── api/
│   ├── routes/
│   │   └── search.ts
│   └── utils/
│       └── strip-raw-html.ts
├── crawler/
│   ├── config/
│   │   └── mapping.ts
│   └── processors/
│       └── normalize.ts
└── es/
    └── generate-mapping.ts
```

```plaintext
tests/unit/
├── api/
│   ├── routes/
│   │   └── search.test.ts
│   └── utils/
│       └── strip-raw-html.test.ts
├── crawler/
│   ├── config/
│   │   └── mapping.test.ts
│   └── processors/
│       └── normalize.test.ts
└── es/
    └── generate-mapping.test.ts
```

フィクスチャも同様に `src/` と対応させる。

```plaintext
tests/fixtures/
├── api/                     # API テスト用データ
├── crawler/                 # Crawler テスト用データ
└── es/                      # ES テスト用データ
```

## テストの目的

テストには 2 つの目的がある。

| 目的 | 説明 |
|------|------|
| **動作確認** | 実装が期待通りに動くことを確認する |
| **バグ発見** | 未知の問題を見つける |

「動作確認」だけでは、実装者が想定したケースしかテストされない。
「バグ発見」の観点を持ち、**実装が壊れる可能性のある入力**を積極的に探す。

## テスト方針

### 1. ユニットテスト

個々の関数やモジュールを独立してテストする。

- **対象**: ヘルパー関数、変換処理、バリデーション
- **実行時間目標**: ~1秒
- **例**:
  - Crawler: HTML パース、正規化処理、ID 生成
  - ES: `generateMapping()`, スキーマ変換
  - API: ルーティング、バリデーション、レスポンス整形

### 2. Property-Based Testing (PBT)

fast-check を使って、ランダム入力で性質を検証する。

- **対象**: エッジケースが多い処理、不変条件がある処理
- **実行時間目標**: ~5-10秒
- **例**: バージョン正規化、ID ユニーク性、スキーマバリデーション

**利点**:

- 例示ベーステストでは発見しにくいエッジケースを発見
- 入力パターンの網羅性が高い
- 不変条件を明示的にテスト

### 3. 整合性テスト

複数の定義間の整合性を検証する。

- **対象**: スキーマ間の対応、設定値の一貫性
- **実行時間目標**: ~1秒
- **例**:
  - Zod スキーマと ES マッピングのフィールド対応
  - API スキーマと内部型の一致

### 4. 実データバリデーションテスト

実際のデータがスキーマに適合するか検証する。

- **対象**: `crawler-results/` からコピーしたサンプル
- **実行時間目標**: ~3-5秒
- **フィクスチャ選定基準**:
  - 通常ケース（代表的なデータ）
  - エッジケース（特殊文字、長い値、null が多いなど）
  - 異なるバリエーション（複数バージョン、異なる ID プレフィックス）

## テストコマンド

```bash
# 全テスト実行
bun test

# モジュール別テスト
bun run test:crawler      # Crawler 関連のみ
bun run test:es           # Elasticsearch 関連のみ
bun run test:api          # API 関連のみ

# カバレッジ付き
bun test --coverage
```

## テスト作成ガイドライン

### ファイル命名

`src/` のファイル名に `.test.ts` を付ける。

```plaintext
src/crawler/processors/normalize.ts
  → tests/unit/crawler/processors/normalize.test.ts
```

複数ファイルにまたがるテストや特殊なテストは、カテゴリ名を使う。

- `{category}-properties.test.ts` - PBT
- `{category}-consistency.test.ts` - 整合性テスト
- `real-data-validation.test.ts` - 実データバリデーション

### テスト構造

```typescript
import { describe, expect, it } from "bun:test"

describe("module/function-name", () => {
  describe("functionName", () => {
    it("should do something specific", () => {
      // Arrange
      const input = ...

      // Act
      const result = functionName(input)

      // Assert
      expect(result).toBe(expected)
    })
  })
})
```

### PBT の例

```typescript
import fc from "fast-check"

describe("function properties", () => {
  it("should maintain invariant X", () => {
    fc.assert(
      fc.property(fc.integer(), (num) => {
        const result = someFunction(num)
        expect(result).toSatisfy(invariantCheck)
      }),
      { numRuns: 100 },
    )
  })
})
```

### バグ発見のためのテスト設計

「通るテスト」だけでなく「壊れうる入力」を探す。

#### 1. 境界値テスト

境界付近でバグが発生しやすい。

```typescript
describe("pagination", () => {
  // 境界値を明示的にテスト
  it.each([
    [0, "zero"],
    [1, "minimum valid"],
    [-1, "negative"],
    [100, "maximum"],
    [101, "over maximum"],
  ])("page=%d (%s)", (page, _desc) => {
    // ...
  })
})
```

#### 2. 異常系・エラーケース

正常系だけでなく、異常な入力を積極的にテストする。

| カテゴリ | 例 |
|----------|-----|
| 空・null | `""`, `null`, `undefined`, `[]`, `{}` |
| 型違い | 数値に文字列、配列にオブジェクト |
| 特殊文字 | `<script>`, `'; DROP TABLE`, `\n\t`, 絵文字 |
| 巨大値 | 超長文字列、巨大配列、深いネスト |
| 不正形式 | 壊れた JSON、不正な URL、不正な日付 |

#### 3. PBT で不変条件を検証

「どんな入力でも成り立つべき性質」を定義し、ランダム入力で検証する。

```typescript
// 例: パース -> シリアライズの往復で元に戻る
fc.assert(
  fc.property(fc.string(), (input) => {
    const parsed = parse(input)
    const serialized = serialize(parsed)
    const reparsed = parse(serialized)
    expect(reparsed).toEqual(parsed)
  }),
)
```

#### 4. 実装を見る前にテストを考える

実装を見てからテストを書くと、実装の癖に合わせたテストになりがち。
以下の順序で考える。

1. 関数のシグネチャ（入力と出力の型）を確認
2. 仕様から「何が正しい動作か」を考える
3. 「何が壊れうるか」を考える（境界値、異常系）
4. テストを書く
5. 実装を読んで追加のエッジケースを探す

## フィクスチャ管理

### ディレクトリ構成

`src/` の構成と対応させる。

```plaintext
fixtures/
├── api/                   # API テスト用データ
├── crawler/               # Crawler テスト用データ
└── es/                    # ES テスト用データ
```

サブディレクトリ構成は各テストの必要に応じて作成する。

### 追加方法

```bash
# 実データから選定してコピー
cp crawler-results/structured-json/research/hum0001.json tests/fixtures/es/
cp crawler-results/html/hum0001.html tests/fixtures/crawler/
```

### 選定基準

1. **代表的なケース**: 最も一般的なデータ構造
2. **エッジケース**: 特殊な値やパターンを含むデータ
3. **異なるタイプ**: 異なる ID プレフィックス（DRA, JGAD など）

## モジュール別テスト観点

### Crawler テスト

| 観点 | 内容 |
|------|------|
| HTML パース | 各ページタイプの正しいパース |
| 正規化 | フィールド変換、null 処理 |
| 構造化 | ja/en マージ、ID 生成 |
| エンリッチ | 外部 API データ統合 |

### ES テスト

| 観点 | 内容 |
|------|------|
| マッピング生成 | スキーマからの正しい変換 |
| スキーマ整合性 | Zod とマッピングの対応 |
| ドキュメントロード | バリデーション、エラー処理 |

### API テスト

| 観点 | 内容 |
|------|------|
| ルーティング | エンドポイント到達性 |
| バリデーション | 入力値検証 |
| レスポンス | 正しい形式、ステータスコード |
| エラー処理 | 異常系の適切なハンドリング |

## 手動テスト

API エンドポイントの動作確認は [api-manual-testing.md](./api-manual-testing.md) を参照。

## API テスト

API テストはユニットテストとインテグレーションテストに分かれている。

### ユニットテスト（ES 不要）

ES 接続なしで実行できるテスト。ルート設定の確認、バリデーション、認証チェックなど。

```bash
# ホスト側で実行（デフォルト）
bun test

# API ユニットテストのみ
bun run test:api
```

### インテグレーションテスト（ES 必要）

実際の ES を使ったテスト。Docker コンテナ内で実行する。

```bash
# コンテナ内で実行
docker compose exec backend bun run test:integration
```

注意:
- インテグレーションテストは `/api` プレフィックス付きで実行される
- `bun test`（デフォルト）ではインテグレーションテストは除外される
- インテグレーションテストは `tests/integration/` に配置する

## 目標メトリクス

| 項目 | 目標 |
|------|------|
| 全テスト実行時間 | ~15秒以下 |
| カバレッジ | 主要関数 80%+ |
| テスト安定性 | Flaky テスト 0 |
