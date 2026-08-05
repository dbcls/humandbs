/**
 * Liveness probes for the services the app cannot run without.
 *
 * The report says pass or fail per check and nothing else. Driver errors carry
 * connection strings and internal hostnames, so they go to `onError` — which
 * writes to the log — instead of into the response body.
 */

export interface HealthCheck {
  name: string
  probe: () => Promise<unknown>
}

export interface HealthReport {
  ok: boolean
  checks: { name: string, ok: boolean }[]
}

export interface HealthOptions {
  /** A hung probe must not hang the endpoint that reports it. */
  timeoutMs?: number
  onError?: (name: string, error: unknown) => void
}

export async function runHealthChecks(
  checks: HealthCheck[],
  options: HealthOptions = {},
): Promise<HealthReport> {
  const timeoutMs = options.timeoutMs ?? 2000

  const results = await Promise.all(checks.map(async (check) => {
    try {
      await withTimeout(check.probe(), timeoutMs, check.name)
      return { name: check.name, ok: true }
    } catch (error) {
      options.onError?.(check.name, error)
      return { name: check.name, ok: false }
    }
  }))

  return { ok: results.every((result) => result.ok), checks: results }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${name} timed out after ${ms}ms`))
        }, ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
