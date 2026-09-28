import { readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { appVersion } from "./version.server"

describe("appVersion", () => {
  it("reads the commit the image was built from", () => {
    expect(appVersion({ HUMANDBS_VERSION: "2a6a2b76" })).toBe("2a6a2b76")
  })

  it("is null where nothing put one in, blank included", () => {
    expect(appVersion({})).toBeNull()
    expect(appVersion({ HUMANDBS_VERSION: "" })).toBeNull()
    expect(appVersion({ HUMANDBS_VERSION: "  " })).toBeNull()
  })
})

describe("the runtime image's HUMANDBS_VERSION", () => {
  /** The instructions of the Dockerfile's `runtime` stage, one per line, continuations joined. */
  async function runtimeStage(): Promise<string[]> {
    const text = await readFile(path.join(import.meta.dirname, "..", "Dockerfile"), "utf8")
    const instructions = text.replace(/\\\n/g, " ").split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"))
    const from = instructions.findIndex((line) => /^FROM\s.+\sAS\s+runtime$/i.test(line))
    const end = instructions.findIndex((line, at) => at > from && /^FROM\s/i.test(line))
    return instructions.slice(from, end === -1 ? undefined : end)
  }

  it("is set after a RUN that follows the argument, since podman reuses a cached ENV layer whatever the argument's value", async () => {
    const stage = await runtimeStage()
    const arg = stage.findIndex((line) => /^ARG\s+HUMANDBS_VERSION\b/.test(line))
    const env = stage.findIndex((line) => /^ENV\s+HUMANDBS_VERSION=/.test(line))
    expect(arg).toBeGreaterThan(0)
    expect(env).toBeGreaterThan(arg)
    expect(stage.slice(arg + 1, env).some((line) => /^RUN\s/.test(line))).toBe(true)
  })
})
