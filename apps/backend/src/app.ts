import express from "express"

const main = () => {
  const app = express()
  const HOST = process.env.HUMANDBS_BACKEND_HOST || "127.0.0.1"
  const PORT = parseInt(process.env.HUMANDBS_BACKEND_PORT || "8080")

  app.get("/", (req, res) => {
    res.json({ message: "Hello from backend!" })
  })

  app.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`)
  })
}

if (require.main === module) {
  main()
}
