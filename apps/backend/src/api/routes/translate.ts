
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { ErrorSpec500 } from "@/api/routes/errors"
import { TranslateRequestSchema, TranslateResponseSchema } from "@/types"

const OLLAMA_URL = process.env.HUMANDBS_BACKEND_OLLAMA_URL || "http://humandbs-ollama-dev:11434"
const OLLAMA_MODEL = "qwen3:8b"

const translateRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Translate text",
  description: "Translates the provided text using an OLLAMA model.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: TranslateRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: TranslateResponseSchema,
        },
      },
      description: "Translated text",
    },
    500: ErrorSpec500,
  },
})

export const translateRouter = new OpenAPIHono()

translateRouter.openapi(translateRoute, async (c) => {
  try {
    const { text, targetLang } = TranslateRequestSchema.parse(await c.req.json())

    const system = [
      "You are a professional translator.",
      `Translate the user's text into ${targetLang} while preserving the original meaning.`,
      "Return only the translated text without any additional information.",
      "No preface, no notes, no explanations.",
      "Keep numbers, URLs, emojis, and code blocks as-is.",
      "Prefer clear and concise translations.",
    ].join(" ")

    const ollamaResponse = await fetch(
      `${OLLAMA_URL}/api/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: false,
          think: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content: text },
          ],
          options: {
            temperature: 0,
            seed: 42,
          },
        }),
      },
    )

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text()
      return c.json({
        error: "Translation failed",
        message: errorText,
      }, 500)
    }

    interface OllamaChat { message?: { content?: string } }
    const data = (await ollamaResponse.json()) as OllamaChat
    const translatedText = data.message?.content?.trim() || ""
    const response = TranslateResponseSchema.parse({ translatedText })

    return c.json(response, 200)
  } catch (error) {
    console.error("Translation error:", error)
    return c.json({
      error: "Translation failed",
      message: (error as Error).message || "An unknown error occurred",
    }, 500)
  }
})
