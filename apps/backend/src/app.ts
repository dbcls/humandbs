import { Client, errors as EsErrors, HttpConnection } from "@elastic/elasticsearch"
import express from "express"

const ES_HOST = "http://humandbs-elasticsearch-dev:9200"
const es = new Client({
  node: ES_HOST,
  Connection: HttpConnection,
})

async function getById(index: string, id: string, _source?: string | string[]) {
  try {
    const res = await es.get({
      index,
      id,
      _source: _source,
    })
    console.log(res)
    return { found: true, doc: res._source ?? null, meta: { index: res._index, id: res._id, version: res._version } }
  } catch (err) {
    if (err instanceof EsErrors.ResponseError && err.statusCode === 404) {
      return { found: false as const }
    }
    throw err
  }
}

const main = () => {
  const app = express()
  const HOST = process.env.HUMANDBS_BACKEND_HOST || "127.0.0.1"
  const PORT = parseInt(process.env.HUMANDBS_BACKEND_PORT || "8080")

  app.get("/", (req, res) => {
    res.json({ message: "Hello from backend!" })
  })

  // === endpoint ===
  app.get("/research/:id", async (req, res) => {
    const { id } = req.params
    try {
      const result = await getById("research", id)
      if (!result.found) return res.status(404).json({ error: "Not found", index: "research", id })
      return res.json(result)
    } catch (e: any) {
      console.error("[GET /api/research/:id] error:", e)
      return res.status(500).json({ error: "Internal error", detail: e.message })
    }
  })

  app.get("/research-version/:id", async (req, res) => {
    const { id } = req.params
    try {
      const result = await getById("research-version", id)
      if (!result.found) return res.status(404).json({ error: "Not found", index: "research-version", id })
      return res.json(result)
    } catch (e: any) {
      console.error("[GET /api/research-version/:id] error:", e)
      return res.status(500).json({ error: "Internal error", detail: e.message })
    }
  })

  app.get("/dataset/:id", async (req, res) => {
    const { id } = req.params
    try {
      const result = await getById("dataset", id)
      if (!result.found) return res.status(404).json({ error: "Not found", index: "dataset", id })
      return res.json(result)
    } catch (e: any) {
      console.error("[GET /api/dataset/:id] error:", e)
      return res.status(500).json({ error: "Internal error", detail: e.message })
    }
  })

  app.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`)
  })
}

if (require.main === module) {
  main()
}
