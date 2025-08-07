import { swaggerUI } from "@hono/swagger-ui"
import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

import { healthRouter } from "@/api/routes/health"
import { researchesRouter } from "@/api/routes/researches"

export const createApp = () => {
  const app = new OpenAPIHono()

  app.use("*", cors())
  app.use("*", logger())

  // routes
  app.route("/health", healthRouter)
  app.route("/researches", researchesRouter)

  // OpenAPI docs
  app.doc("/docs/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "HumanDB Backend API",
      version: "1.0.0",
      description: "API for accessing HumanDB research data",
    },
  })
  app.get("/docs", swaggerUI({
    url: "/docs/openapi.json",
  }))

  return app
}

const app = createApp()

export default app
