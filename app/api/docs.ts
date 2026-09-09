/**
 * The document, drawn.
 *
 * **Swagger UI, and served from this origin.** ddbj-search-api draws its own
 * document with the same tool, so a reader who arrives from there finds the
 * operations laid out where they already know to look; what is not copied from
 * there is where the script comes from, because a page that stops working when
 * somebody else's CDN does is a dependency taken on for nothing.
 *
 * **The page is plain HTML and not a route of the site.** It carries no header,
 * no footer and no language prefix, because it is not a page of the portal — it
 * is the contract, made readable. Keeping it out of the application's tree also
 * keeps Swagger UI's stylesheet and the site's own from having to be held apart
 * for as long as both exist.
 *
 * **The library is copied into `public/` before a build** rather than imported,
 * because an import would be handed to the bundler and this page is not built:
 * it is a string. What `public/` holds is served as it stands, which is what a
 * stylesheet needs — anything else arrives claiming to be JavaScript and a
 * browser will not style a page with it.
 */

import { OPENAPI_PATH } from "./endpoints"

/** Under `public/`, and under the site, at the same name. */
export const SWAGGER_UI_DIR = "swagger-ui"

const STYLES = "swagger-ui.css"
const SCRIPT = "swagger-ui-bundle.js"

/** What `scripts/swagger-ui.ts` copies out of the package. The page loads both. */
export const SWAGGER_UI_FILES = [STYLES, SCRIPT]

/**
 * `deepLinking` so that an operation has an address of its own: pointing
 * somebody at one endpoint is the reason this page gets sent to anybody.
 *
 * `tryItOutEnabled` because there is nothing to fill in first — the API takes
 * no credentials, so every operation here is one button away from an answer.
 */
const PAGE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>NBDC Human Database API</title>
    <link rel="icon" href="/favicon.ico" sizes="48x48">
    <link rel="stylesheet" href="/${SWAGGER_UI_DIR}/${STYLES}">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/${SWAGGER_UI_DIR}/${SCRIPT}"></script>
    <script>
      SwaggerUIBundle({
        url: "/${OPENAPI_PATH}",
        dom_id: "#swagger-ui",
        deepLinking: true,
        tryItOutEnabled: true,
      })
    </script>
  </body>
</html>
`

export function docsPage(): Response {
  return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}
