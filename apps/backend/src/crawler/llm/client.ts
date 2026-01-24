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
}

const DEFAULT_BASE_URL = "http://localhost:1143"
const DEFAULT_MODEL = "llama3.3:70b"

/**
 * Get Ollama configuration from environment variables
 */
export const getOllamaConfig = (): Required<OllamaConfig> => ({
  baseUrl: process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL,
  model: process.env.OLLAMA_MODEL || DEFAULT_MODEL,
  timeout: 300000,
})

/**
 * Send a chat request to Ollama API
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
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), effectiveConfig.timeout)

  logger.debug("Ollama chat request", { model: effectiveConfig.model, messageCount: messages.length })

  try {
    const response = await fetch(`${effectiveConfig.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    })

    if (!response.ok) {
      logger.error("Ollama API error", { status: response.status, statusText: response.statusText })
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
    }

    const json = (await response.json()) as OllamaResponse
    logger.debug("Ollama chat response received", { contentLength: json.message.content.length })
    return json.message.content
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.error("Ollama request timed out", { timeout: effectiveConfig.timeout })
    } else {
      logger.error("Ollama request failed", { error: getErrorMessage(error) })
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
