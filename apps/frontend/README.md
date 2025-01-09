# humandbs　フロントエンド

## 動的にMarkdownファイルをimportする方法

`src/content/xxx.md` に保存されたMarkdownファイルを置くと

```tsx
import markdown from '@content/xxx.md';
```

のようにして、動的にMarkdownファイルをimportして表示することができる。

## 静的なMarkdownファイルを表示する方法

GitHub に保存されたMarkdownファイルを表示することもできる。
[/contact](/contact) にアクセスすると、公的のGitHub レポ（tailwindcss のリポ）に保存された `readme.md` が表示される。
