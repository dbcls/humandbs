/**
 * Puts Swagger UI where the page that draws the document can reach it.
 *
 * The library ships as files under `node_modules`, and the page loading them is
 * plain HTML rather than part of the application's tree (`app/api/docs.ts`), so
 * nothing in the build would otherwise carry them anywhere. Copying them into
 * `public/` is what serves them: as they are by the dev server, and into
 * `build/client/` by a build.
 *
 * **The copies are not committed.** They are whatever the installed version
 * holds, and a checked-in copy would be one more thing that has to be
 * remembered when the dependency moves.
 *
 * Runs before `dev` and before `build` (`package.json`), so a checkout that has
 * installed has nothing else to do.
 */

import { copyFile, mkdir } from "node:fs/promises"
import { createRequire } from "node:module"
import { join } from "node:path"

import { SWAGGER_UI_DIR, SWAGGER_UI_FILES } from "~/api/docs"

const resolve = createRequire(import.meta.url).resolve

const destination = join("public", SWAGGER_UI_DIR)
await mkdir(destination, { recursive: true })

for (const name of SWAGGER_UI_FILES) {
  await copyFile(resolve(`swagger-ui-dist/${name}`), join(destination, name))
}

console.log(`swagger-ui: ${SWAGGER_UI_FILES.join(", ")} -> ${destination}/`)
