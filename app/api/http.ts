/**
 * How every answer on the JSON API is put together.
 *
 * One place, so that the two things every answer has to carry cannot be
 * forgotten on one endpoint: the cross-origin header, and the content type that
 * says which of the two body formats this is.
 *
 * **The API is open to every origin.** It carries no credentials and returns
 * only what is already published, so there is nothing an origin could be
 * trusted with that another could not. No preflight is involved — every route
 * is a plain `GET` — so no `OPTIONS` handler is needed either.
 *
 * **Bulk answers are written a record to a line.** A whole corpus in one array
 * would make a reader hold all of it before the first record could be looked at,
 * and would leave a reader that only wants part of it no way to stop. The portal
 * still builds the whole answer — the corpus is a few thousand rows — so what is
 * gained here is on the reading side.
 */

import type { Problem } from "./problem"

export const JSON_TYPE = "application/json"
export const PROBLEM_TYPE = "application/problem+json"
export const NDJSON_TYPE = "application/x-ndjson"

function headers(contentType: string): HeadersInit {
  return {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Access-Control-Allow-Origin": "*",
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(JSON_TYPE) })
}

export function problemResponse(problem: Problem): Response {
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: headers(PROBLEM_TYPE),
  })
}

/**
 * One JSON value per line.
 *
 * The records arrive as an async iterable so that the source decides how much
 * it holds at once; nothing here accumulates.
 */
export function ndjsonResponse(records: AsyncIterable<unknown> | Iterable<unknown>): Response {
  const encoder = new TextEncoder()
  const iterator: AsyncIterator<unknown> | Iterator<unknown> = Symbol.asyncIterator in records
    ? records[Symbol.asyncIterator]()
    : records[Symbol.iterator]()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next()
      if (next.done === true) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`))
    },
    async cancel(reason: unknown) {
      await iterator.return?.(reason)
    },
  })
  return new Response(stream, { headers: headers(NDJSON_TYPE) })
}
