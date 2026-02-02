import { createApp } from "@/api/app"
import { logger } from "@/api/logger"

const main = () => {
  const app = createApp()
  const HOST = process.env.HUMANDBS_BACKEND_HOST || "127.0.0.1"
  const PORT = parseInt(process.env.HUMANDBS_BACKEND_PORT || "8080")

  logger.info("Server starting", { host: HOST, port: PORT })

  Bun.serve({
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  })
}

if (import.meta.main) {
  main()
}
