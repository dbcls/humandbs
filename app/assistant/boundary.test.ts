/**
 * The two invariants `docs/assistant.md` names, held by reading the source.
 *
 * The assistant answers to anybody who can reach it — it holds no
 * authorisation of its own and reads no token — so who may reach it is decided
 * entirely by the one route in front of it. Neither invariant can be checked by
 * calling anything: the first is about a guard being present rather than about
 * an answer, and the second is about the absence of a call somewhere else in
 * the tree. Both are the same shape as the rules in `app/app.spacing.test.ts`.
 */

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

const APP = path.join(import.meta.dirname, "..")

/** Every `.ts` / `.tsx` under `app/`, less the tests. */
async function sources(): Promise<{ name: string, text: string }[]> {
  const found: { name: string, text: string }[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(path.join(APP, dir), { withFileTypes: true })) {
      const here = dir === "" ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        await walk(here)
        continue
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) continue
      found.push({ name: here, text: await readFile(path.join(APP, here), "utf8") })
    }
  }

  await walk("")
  return found
}

describe("アシスタントとの境界", () => {
  /**
   * The service is reachable from the portal and from nowhere else, so a second
   * caller would be a second door — and one without the capability check, since
   * that lives in the route rather than in the module it calls.
   */
  it("proxy 以外からアシスタントを呼ばない", async () => {
    const callers = (await sources())
      .filter(({ text }) => text.includes("forwardToAssistant"))
      .map(({ name }) => name)
      .sort()

    expect(callers).toEqual([
      "assistant/proxy.server.ts",
      "routes/admin-assistant-api.ts",
    ])
  })

  /**
   * Knowing where the service is would be enough to call it directly. The screen
   * is allowed to read whether the address is set at all — that is how it says
   * the assistant is not running — and nothing else may read it.
   */
  it("サービスのアドレスを知っているのは proxy と、動いているかを言う画面だけ", async () => {
    const readers = (await sources())
      .filter(({ text }) => text.includes("assistantOrigin"))
      .map(({ name }) => name)
      .sort()

    expect(readers).toEqual([
      "assistant/proxy.server.ts",
      "config.server.ts",
      "routes/admin-assistant.tsx",
    ])
  })

  /**
   * Being reachable here is the whole of the authorisation, so the guard has to
   * be in the route rather than anywhere it could be reached around.
   */
  it("proxy の route が capability を要求する", async () => {
    const text = await readFile(path.join(APP, "routes/admin-assistant-api.ts"), "utf8")
    expect(text).toContain("requireCapability(request, \"use-assistant\")")
  })

  /** The shape of what is forwarded is the assistant's, so this is the only check left. */
  it("proxy の route がよそのサイトからの要求を拒む", async () => {
    const text = await readFile(path.join(APP, "routes/admin-assistant-api.ts"), "utf8")
    expect(text).toContain("fromSameSite(request)")
  })
})
