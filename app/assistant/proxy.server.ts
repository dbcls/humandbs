import { loadConfig } from "~/config.server"

import {
  assistantTarget,
  hasBody,
  forwardedRequestHeaders,
  forwardedResponseHeaders,
} from "./target"

/** Long enough for a service that is up, short enough that the screen does not wait long on one that is not. */
const RUNNING_TIMEOUT_MS = 3_000

/**
 * Whether the assistant is configured and responds, for the screen to choose
 * between the assistant and the notice that it is not running.
 *
 * **Any response counts, whatever its status.** The request goes to the root
 * of the origin, which is none of the service's endpoints, so the portal still
 * knows nothing about the API; all that is checked is that something is
 * listening there. The screen receives a boolean, never the address.
 */
export async function isAssistantRunning(timeoutMs = RUNNING_TIMEOUT_MS): Promise<boolean> {
  const origin = loadConfig(process.env).assistantOrigin
  if (origin === null) return false

  try {
    await fetch(new URL("/", origin), {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    })
    return true
  } catch {
    // The name does not resolve, the connection is refused or nothing comes
    // back in time: the container is removed, stopped or still starting.
    return false
  }
}

/**
 * Hands a request on to the assistant and returns its response.
 *
 * **This module is the whole of the portal's part.** The assistant holds no
 * authorisation of its own and is not published outside the compose network, so
 * the guard in front of this call is the only one there is — and the two
 * invariants that keeps are worth stating plainly: the route requires
 * `use-assistant` before calling this, and nothing outside this module calls
 * the service at all.
 *
 * **Nothing about the API is known here.** Paths, methods, bodies and status
 * codes are passed through, so the service can grow an endpoint without the
 * portal being edited — which is the point, because the service is written by
 * somebody else.
 */
export async function forwardToAssistant(request: Request, rest: string): Promise<Response> {
  const origin = loadConfig(process.env).assistantOrigin
  if (origin === null) {
    // The service is absent in environments that do not run it, which is a
    // normal environment rather than a broken one — the same shape as the
    // upstream database being unreachable (`config.server.ts`).
    throw new Response(null, { status: 503, statusText: "Assistant is not configured" })
  }

  const url = new URL(request.url)
  const target = assistantTarget(origin, rest, url.search)
  if (target === null) {
    throw new Response(null, { status: 400, statusText: "Bad Request" })
  }

  const sending = hasBody(request.method)
  let answer: Response
  try {
    answer = await fetch(target, {
      method: request.method,
      headers: forwardedRequestHeaders(request.headers),
      // Streamed rather than read into memory first: an application is a PDF,
      // and the upload has no reason to be held here on its way past.
      body: sending ? request.body : undefined,
      // Required by the runtime whenever a body is a stream; without it the
      // request is refused before it is sent.
      ...(sending ? { duplex: "half" } : {}),
      // An answer is passed on as it is, so a redirect is the assistant's
      // to give rather than something to resolve on its behalf.
      redirect: "manual",
      // A reader who closes the tab stops the work: without this the service
      // reads an application nobody is waiting for, and the portal holds a
      // connection to it until it finishes.
      signal: request.signal,
    })
  } catch {
    // The service is configured but not responding, or took longer than the
    // runtime waits for a first byte (five minutes). Said apart from 503
    // above: that one means nobody deployed it, this one means it did not
    // answer.
    throw new Response(null, { status: 502, statusText: "Assistant did not answer" })
  }

  return new Response(answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers: forwardedResponseHeaders(answer.headers),
  })
}
