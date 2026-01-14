import { readdirSync, writeFileSync } from "fs"

const DIR_PATH = "/app/apps/backend/crawler-results/html"
const OUTPUT_PATH = "/app/apps/backend/crawler-results/hum-id-pair.json"

const files = readdirSync(DIR_PATH)

const results = Array.from(
  new Set(
    files.map((file) => {
      if (!file.endsWith(".html")) return null
      const match = file.match(/^detail-(hum\d+)-(v\d+)-/)
      if (!match) return null
      const [, humId, version] = match
      return `${humId}-${version}`
    }).filter(Boolean),
  ),
).map((key) => {
  const [humId, version] = key!.split("-")
  return { humId, version }
})

writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2))
