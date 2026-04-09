# ステージング環境へのデプロイ

podman コンテナはすでに起動中であることが多いため、停止・再ビルド・再起動が必要です。

- サーバー上で `git pull` を実行
- コンテナを再起動（内部の `bun run serve` を停止するため）: `podman restart humandbs-staging-frontend`
- 必要に応じて DB のマイグレーションとシードを実施
  - コンテナの bash に入る: `podman exec -it humandbs-staging-frontend bash`
  - 内部で DB スキーマの変更を適用: `bun run db:push`
  - ドキュメントのシード: `bun run db:seed-documents`
  - ナビゲーション設定のシード: `bun run db:seed-navigation`
- ビルドと起動: `podman exec -d humandbs-staging-frontend bash -lc 'bun run build && bun run start'`

nginx の設定を更新する場合（バックエンドエンジニアに相談してください）:

- nginx の設定を更新
- `podman rm -f humandbs-staging-nginx`
- `podman-compose --env-file .env up -d nginx`

# 開発時のトラブルシューティング

## 1. サーバーサイドのモジュールを誤ってインポートしてしまう場合

以下のようなエラーが発生する場合:

```sh
[plugin:vite:import-analysis] Failed to resolve import "tanstack-start-injected-head-scripts:v" from "../../node_modules/@tanstack/start-server-core/dist/esm/router-manifest.js?v=8960f5d8". Does the file exist?
```

クライアント/ルートファイルにサーバー専用のモジュールをインポートしている可能性があります。

> 型のインポートも同様です。各インポートに個別に `type` を付けるのではなく、`import type` 構文を使用してください。

```ts
// ルートファイル
import { type NewsTitleResponse } from "@/serverFunctions/news"; // エラー！

import type { NewsTitleResponse } from "@/serverFunctions/news"; // OK！
```
