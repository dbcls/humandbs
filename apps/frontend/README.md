# HumanDBsのFrontend

SSR フレームワークとして、[Tanstack Start](https://tanstack.com/start/latest) を使用しています。

フロントエンドの管轄は

- 静的なページのコンテンツ管理（CMS） (タオえば /guidelines, /faq など)
- Backend API を使用し、Research, Dataset の管理とファセット検索機能

```
      nginx
        │
        v
    +----------+
    | Frontend |
    +----------+
         │
         ├<──> CMS PostgreSQL
         │
         └<──> Backend api at /api/**

```

CMS機能は PostgreSQL　DBを使います。コンテンツのフォーマットとしては、　Markdownを使っています。

# Develop

## Format & Lint

Formatting と Linting は、両方ともが [Biome](https://biomejs.dev/) を使っています。

## バックエンドの Zod スキーマをフロントエンドで使用する際の注意点

1. フロントエンドはバックエンドの Zod スキーマをインポートしているため、フロントエンドで使用しているバックエンドのスキーマが変更された場合は、更新後のスキーマを反映するためにフロントエンドを再ビルドする必要があります。

2. `bun.lock` を正しく維持するため、新しいパッケージのインストールや不要なパッケージの削除は、必ず Docker コンテナ内で行ってください。

## Testing

**Unit testing** は、ファイルの隣に、 `<filename>.test.ts`を置きます。
例：
`src/lib/cmsDataTransferArchive.ts` のユニットテストが `src/lib/cmsDataTransferArchive.test.ts`　におく。

**E2e testing** (Playwright) は、`e2e`　フォルダに入っています。　Docker に ignoreされるようにしているので、e2e は、ローカルで実行。詳しくは、[e2e　README](./e2e/README.md) を参照ください。

## 開発時のトラブルシューティング

### サーバーサイドのモジュールを誤ってインポートしてしまう場合

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

# More info

さらに詳しいDBの構成、Env var などの設定について、`./docs`　に説明されています。
