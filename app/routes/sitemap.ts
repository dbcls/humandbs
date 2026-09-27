import { loadConfig, publicOrigin } from "~/config.server"
import { getDb } from "~/db/client.server"
import { sitemapXml } from "~/public/crawl"
import { sitemapPages } from "~/public/crawl.server"

export async function loader() {
  const config = loadConfig(process.env)
  // A deployment kept out of search engines has nothing to list.
  if (config.noindex) throw new Response("Not Found", { status: 404 })
  return new Response(sitemapXml(await sitemapPages(getDb()), publicOrigin(config.auth)), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  })
}
