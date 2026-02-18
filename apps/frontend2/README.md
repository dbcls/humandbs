# Troubleshooting

## 1. Acidentally importing stuff from the server-side

When error is like

```sh
[plugin:vite:import-analysis] Failed to resolve import "tanstack-start-injected-head-scripts:v" from "../../node_modules/@tanstack/start-server-core/dist/esm/router-manifest.js?v=8960f5d8". Does the file exist?
```

Most likely it is due importing something that is server-only into client/route file.

> ! Types too, unless all named imports are preceded by the `type`, not individual ones

```ts
// route file
import { type NewsTitleResponse } from "@/serverFunctions/news"; // ERROR!

import type { NewsTitleResponse } from "@/serverFunctions/news"; // OK!
```
