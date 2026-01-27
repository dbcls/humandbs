/**
 * Ollama API client
 */
import { getErrorMessage } from "@/crawler/utils/error"
import { logger } from "@/crawler/utils/logger"

/** Ollama chat message */
export interface OllamaMessage {
  role: "system" | "user" | "assistant"
  content: string
}

/** Ollama API request */
interface OllamaRequest {
  model: string
  messages: OllamaMessage[]
  format?: "json"
  stream?: boolean
  options?: Record<string, unknown>
}

/** Ollama API response */
interface OllamaResponse {
  message: {
    content: string
  }
}

/** Ollama client configuration */
export interface OllamaConfig {
  baseUrl?: string
  model?: string
  timeout?: number
  numCtx?: number
}

const DEFAULT_BASE_URL = "http://localhost:1143"
const DEFAULT_MODEL = "llama3.3:70b"
const DEFAULT_NUM_CTX = 16384
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 2000

/**
 * Get Ollama configuration from environment variables
 */
export const getOllamaConfig = (): Required<OllamaConfig> => ({
  baseUrl: process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL,
  model: process.env.OLLAMA_MODEL || DEFAULT_MODEL,
  timeout: 300000,
  numCtx: process.env.OLLAMA_NUM_CTX
    ? parseInt(process.env.OLLAMA_NUM_CTX, 10)
    : DEFAULT_NUM_CTX,
})

/**
 * Sleep for a given number of milliseconds
 */
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

/**
 * Send a chat request to Ollama API with retry logic
 */
export const chat = async (
  messages: OllamaMessage[],
  config?: OllamaConfig,
): Promise<string> => {
  const effectiveConfig = { ...getOllamaConfig(), ...config }

  const request: OllamaRequest = {
    model: effectiveConfig.model,
    messages,
    format: "json",
    stream: false,
    options: {
      num_ctx: effectiveConfig.numCtx,
    },
  }

  logger.debug("Ollama chat request", { model: effectiveConfig.model, messageCount: messages.length })

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), effectiveConfig.timeout)

    try {
      const response = await fetch(`${effectiveConfig.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const json = (await response.json()) as OllamaResponse
      logger.debug("Ollama chat response received", { contentLength: json.message.content.length })
      return json.message.content
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError"
      const errorMsg = isTimeout ? "Request timed out" : getErrorMessage(error)

      if (attempt < MAX_RETRIES) {
        const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        logger.warn("Ollama request failed, retrying", { attempt, maxRetries: MAX_RETRIES, delayMs, error: errorMsg })
        await sleep(delayMs)
      } else {
        logger.error("Ollama request failed after all retries", { attempts: MAX_RETRIES, error: errorMsg })
        throw error
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // Unreachable, but TypeScript needs this
  throw new Error("Unexpected: exceeded max retries without throwing")
}
