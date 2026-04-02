# Deploy to staging

Since the podman container is most likety already running, we need to stop it, rebuild and restart.

- `git pull` on the server
- Restart container (to stop the inner `bun run serve`): `podman restart humandbs-staging-frontend`
- Migrate DB if needed
  - Enter the container bash: `podman exec -it humandbs-staging-frontend bash`
  - Inside, apply DB schema changes if any: `bun run db:push`
- Build & start: `podman exec -d humandbs-staging-frontend bash -lc 'bun run build && bun run start'`

If needed, when updating nginx config (consult with backend engineer):

- Update nginx config
- `podman rm -f humandbs-staging-nginx`
- `podman-compose --env-file .env up -d nginx`

# Development Troubleshooting

## 1. Accidentally importing stuff from the server-side

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
