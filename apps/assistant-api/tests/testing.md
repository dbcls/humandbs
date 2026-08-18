# テスト方針

HumanDBs Assistant API のテスト方針。仕様を docs と test で固定するための最小ルールをまとめる。

## 目的

- OpenAPI と実装の食い違いを早期に検出する
- admin 認証の 401 / 403 / 許可パスを壊さない
- LLM や外部 API に依存する不安定なテストを unit 層に持ち込まない

## 原則

- API 契約の SSOT は OpenAPI。横断仕様は [docs/api-guide.md](../docs/api-guide.md) で補足する
- unit test は FastAPI アプリまたは pure function / dependency を対象にし、外部境界は monkeypatch / stub する
- Google API、OpenAI、Playwright、PDF 解析、ファイル実体の大半は unit test で本物を叩かない
- バグ修正時は必ず回帰テストを追加する

## テスト分類

| 分類 | 場所 | 説明 |
|---|---|---|
| Unit | `tests/unit/` | OpenAPI 契約、認証 dependency、純粋な utility / service の分岐を検証する |
| Integration | `tests/integration/` | 将来的に実ファイル・実外部 API を必要最小限で接続確認する |
| Smoke | `tests/smoke/` | デプロイ済み Assistant API の疎通確認 |

現時点では Unit を優先し、Integration / Smoke は必要になった機能から追加する。

## ディレクトリ構成

```plaintext
tests/
├── testing.md
└── unit/
    ├── test_auth.py
    └── test_openapi_doc.py
```

`tests/unit/` は `src/` のうち「API 契約を支配する入口」と「横断 dependency」を優先して増やす。

## Mock 戦略

- Mock する: LLM 呼び出し、Google / OpenAI / Playwright、バックグラウンド task 実行、重い PDF 解析
- Mock しない: FastAPI の routing / dependency 解決、Pydantic モデル、認証 dependency の分岐、OpenAPI 生成

`src.app` は import 時にサービス層へ依存するため、OpenAPI 契約テストでは必要最小限の stub module を差し込んで app import を安定化させる。

## 命名規則

- test 関数名は「何を保証するか」が読める形にする
- 回帰テストは `test_bug_<issue_or_pr>_<short_name>` 形式を推奨する

## 実行コマンド

プロジェクトルート `apps/assistant-api` で実行する。

```bash
python -m pytest tests/unit
python -m pytest tests/unit/test_openapi_doc.py
python -m pytest tests/unit/test_auth.py
```

`uv` や仮想環境を使う場合も、上記と同等に `pytest` が依存関係解決済みの Python で動くことを前提とする。

## 最初に増やすべき観点

- 全 `/api/*` operation が Bearer 認証前提で OpenAPI に出ること
- docs / openapi metadata が欠落していないこと
- admin token なし / 無効 / 非 admin / admin の 4 パス
- file upload endpoint の必須入力が OpenAPI に出ていること