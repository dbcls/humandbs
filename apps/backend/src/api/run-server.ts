import { createApp } from "@/api/app"

const main = () => {
  const app = createApp()
  const HOST = process.env.HUMANDBS_BACKEND_HOST || "127.0.0.1"
  const PORT = parseInt(process.env.HUMANDBS_BACKEND_PORT || "8080")

  console.log(`Server is running on http://${HOST}:${PORT}`)

  Bun.serve({
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  })
}

if (import.meta.main) {
  main()
}
