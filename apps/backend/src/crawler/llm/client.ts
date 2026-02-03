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
  format?: "json" | Record<string, unknown>
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
  baseUrl: string
  model?: string
  timeout?: number
  numCtx?: number
}

/** Default config values (excluding baseUrl which must be provided explicitly) */
export interface OllamaDefaultConfig {
  model: string
  timeout: number
  numCtx: number
}

const DEFAULT_MODEL = "llama3.3:70b"
const DEFAULT_NUM_CTX = 4096
const DEFAULT_TIMEOUT = 300000

/**
 * Get Ollama default configuration
 * Note: All Ollama settings should be provided via CLI arguments
 */
export const getOllamaDefaultConfig = (): OllamaDefaultConfig => ({
  model: DEFAULT_MODEL,
  timeout: DEFAULT_TIMEOUT,
  numCtx: DEFAULT_NUM_CTX,
})

/**
 * Send a chat request to Ollama API (single attempt, no retry)
 * Retry logic is handled at the worker pool level for better parallelism
 * @param messages - Chat messages
 * @param config - Ollama configuration
 * @param format - Output format: "json" for JSON mode, or a JSON Schema object for structured outputs
 */
export const chat = async (
  messages: OllamaMessage[],
  config: OllamaConfig,
  format: "json" | Record<string, unknown> = "json",
): Promise<string> => {
  const effectiveConfig = { ...getOllamaDefaultConfig(), ...config }

  const request: OllamaRequest = {
    model: effectiveConfig.model,
    messages,
    format,
    stream: false,
    options: {
      num_ctx: effectiveConfig.numCtx,
    },
  }

  logger.debug("Ollama chat request", { model: effectiveConfig.model, messageCount: messages.length })

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
    logger.warn("Ollama request failed", { error: errorMsg })
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
