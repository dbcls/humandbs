import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

const SCRIPT = join(import.meta.dirname, "deploy.sh")
const PROJECT = "humandbs-staging"
const TAG = "abcd1234"
const STAMP = "20261001-120000"

/**
 * Every command deploy.sh changes the deployment with, recorded one per line
 * together with what the log directory held when it ran.
 */
const RECORD = `printf '%s | %s\\n' "$(basename "$0") $*" "$(ls "$STUB_LOG_DIR" 2>/dev/null | tr '\\n' ' ')" >> "$STUB_LOG"`

/**
 * podman as deploy.sh reaches it: every container of the project exists but
 * the assistant, the build left an application image of `STUB_BUILT`, and
 * pg_dump prints a stand-in archive.
 */
const PODMAN_STUB = `#!/bin/sh
${RECORD}
case "$*" in
  "container exists "*_assistant-api_1) exit 1 ;;
  "container exists "*) exit 0 ;;
  "image inspect "*) printf 'PATH=/usr/bin\\nHUMANDBS_VERSION=%s\\n' "$STUB_BUILT"; exit 0 ;;
  "exec "*" pg_dump "*) printf 'PGDMP stand-in'; exit 0 ;;
esac
exit 0
`

/**
 * podman-compose, which cannot make a container whose log directory is
 * missing, and whose application and proxy append to their files as conmon
 * does.
 */
const PODMAN_COMPOSE_STUB = `#!/bin/sh
${RECORD}
case "$*" in
  "up "*) [ -d "$STUB_LOG_DIR" ] || exit 125 ;;
esac
case "$*" in
  "up -d app proxy")
    printf 'new app\\n' >> "$STUB_LOG_DIR/app.log"
    printf 'new proxy\\n' >> "$STUB_LOG_DIR/proxy.log" ;;
esac
exit 0
`

const CURL_STUB = `#!/bin/sh
${RECORD}
exit "\${STUB_CURL_EXIT:-0}"
`

let root: string
let deployment: string
let logDir: string
let dataDir: string

function write(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, content)
}

function stub(name: string, content: string): void {
  write(join(root, "bin", name), content)
  spawnSync("chmod", ["+x", join(root, "bin", name)])
}

function envFile(logDirValue: string): string {
  return [
    "HUMANDBS_POSTGRES_USER=humandbs",
    "HUMANDBS_POSTGRES_DB=humandbs",
    "HUMANDBS_PUBLIC_BIND_HOST=0.0.0.0",
    "HUMANDBS_PUBLIC_PORT=5011",
    `HUMANDBS_DATA_DIR=${dataDir}`,
    `HUMANDBS_LOG_DIR=${logDirValue}`,
    "",
  ].join("\n")
}

function deploySh(args: string[], env: Record<string, string> = {}) {
  const log = join(root, "calls")
  rmSync(log, { force: true })
  const result = spawnSync("sh", [SCRIPT, ...args], {
    cwd: deployment,
    encoding: "utf8",
    env: {
      PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`,
      HOME: root,
      STUB_LOG: log,
      STUB_LOG_DIR: logDir,
      STUB_BUILT: args.at(-1) ?? "",
      STUB_STAMP: STAMP,
      ...env,
    },
  })
  const calls = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((line) => line !== "") : []
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls,
    /** What the log directory held when the first call starting with `command` ran. */
    logsAt(command: string): string[] {
      const call = calls.find((line) => line.startsWith(`${command} |`) || line.startsWith(`${command} `))
      if (call === undefined) {
        throw new Error(`${command} was not called:\n${calls.join("\n")}`)
      }
      return (call.split(" | ")[1] ?? "").split(" ").filter((name) => name !== "").sort()
    },
    indexOf(command: string): number {
      return calls.findIndex((line) => line.startsWith(`${command} `))
    },
  }
}

function logs(): string[] {
  return existsSync(logDir) ? readdirSync(logDir).sort() : []
}

function gunzip(name: string): string {
  return gunzipSync(readFileSync(join(logDir, name))).toString("utf8")
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "deploy-sh-"))
  deployment = join(root, PROJECT)
  logDir = join(root, "logs")
  dataDir = join(root, "data")
  write(join(deployment, ".env"), envFile(logDir))
  write(join(deployment, "compose.override.yml"), "")
  stub("podman", PODMAN_STUB)
  stub("podman-compose", PODMAN_COMPOSE_STUB)
  stub("curl", CURL_STUB)
  stub("sleep", "#!/bin/sh\nexit 0\n")
  stub("date", "#!/bin/sh\necho \"$STUB_STAMP\"\n")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("scripts/deploy.sh のログ", () => {
  beforeEach(() => {
    write(join(logDir, "app.log"), "old app\n")
    write(join(logDir, "proxy.log"), "old proxy\n")
    write(join(logDir, "db.log"), "db\n")
    write(join(logDir, "s3.log"), "s3\n")
    write(join(logDir, "assistant-api.log"), "assistant\n")
  })

  it("app と proxy の container を消したあと、起動する前に 2 つのログの名前を変え、/healthz が 200 を返してから gzip する", () => {
    const run = deploySh([TAG])

    expect(run.status).toBe(0)
    const appSetAside = `app-${STAMP}-before-${TAG}.log`
    const proxySetAside = `proxy-${STAMP}-before-${TAG}.log`
    expect(run.logsAt(`podman rm ${PROJECT}_app_1`)).toContain("app.log")
    expect(run.logsAt(`podman rm ${PROJECT}_proxy_1`)).toContain("proxy.log")
    const atStart = run.logsAt("podman-compose up -d app proxy")
    expect(atStart).not.toContain("app.log")
    expect(atStart).not.toContain("proxy.log")
    expect(atStart).toEqual(expect.arrayContaining([appSetAside, proxySetAside]))
    expect(run.logsAt("curl")).toEqual(expect.arrayContaining([appSetAside, proxySetAside]))
    expect(run.indexOf(`podman rm ${PROJECT}_app_1`)).toBeLessThan(run.indexOf("podman-compose up -d app proxy"))

    expect(logs()).toEqual([`${appSetAside}.gz`, "app.log", "assistant-api.log", "db.log", `${proxySetAside}.gz`, "proxy.log", "s3.log"].sort())
    expect(gunzip(`${appSetAside}.gz`)).toBe("old app\n")
    expect(gunzip(`${proxySetAside}.gz`)).toBe("old proxy\n")
    expect(readFileSync(join(logDir, "app.log"), "utf8")).toBe("new app\n")
  })

  it("db・s3・assistant-api のログには触らない", () => {
    const run = deploySh([TAG])

    expect(run.status).toBe(0)
    expect(readFileSync(join(logDir, "db.log"), "utf8")).toBe("db\n")
    expect(readFileSync(join(logDir, "s3.log"), "utf8")).toBe("s3\n")
    expect(readFileSync(join(logDir, "assistant-api.log"), "utf8")).toBe("assistant\n")
  })

  it("名前に DB の backup と同じ時刻と tag を使う", () => {
    const run = deploySh([TAG])

    expect(run.status).toBe(0)
    expect(readdirSync(join(dataDir, "backup"))).toEqual([`${STAMP}-before-${TAG}.dump`])
    expect(logs()).toContain(`app-${STAMP}-before-${TAG}.log.gz`)
  })

  it("rollback でも、戻す先の tag の名前で同じように名前を変えて gzip する", () => {
    const run = deploySh(["rollback", "0123abcd"])

    expect(run.status).toBe(0)
    expect(run.logsAt("podman-compose up -d app proxy")).toContain(`app-${STAMP}-before-0123abcd.log`)
    expect(gunzip(`app-${STAMP}-before-0123abcd.log.gz`)).toBe("old app\n")
    expect(gunzip(`proxy-${STAMP}-before-0123abcd.log.gz`)).toBe("old proxy\n")
  })

  it("/healthz が 200 を返さなければ、名前を変えたログを gzip せずに残し、次の実行で gzip する", () => {
    const failed = deploySh([TAG], { STUB_CURL_EXIT: "22" })

    expect(failed.status).not.toBe(0)
    expect(failed.stderr).toContain("/healthz did not answer 200")
    expect(logs()).toEqual(expect.arrayContaining([`app-${STAMP}-before-${TAG}.log`, `proxy-${STAMP}-before-${TAG}.log`]))

    const next = deploySh([TAG], { STUB_STAMP: "20261001-121500" })

    expect(next.status).toBe(0)
    expect(gunzip(`app-${STAMP}-before-${TAG}.log.gz`)).toBe("old app\n")
    expect(gunzip(`app-20261001-121500-before-${TAG}.log.gz`)).toBe("new app\n")
    expect(logs().filter((name) => name.endsWith("-before-" + TAG + ".log"))).toEqual([])
  })

  it("変えた先の名前のファイルがあれば、そのログの名前は変えずに、新しい container に追記させる", () => {
    write(join(logDir, `app-${STAMP}-before-${TAG}.log.gz`), "earlier")

    const run = deploySh([TAG])

    expect(run.status).toBe(0)
    expect(readFileSync(join(logDir, `app-${STAMP}-before-${TAG}.log.gz`), "utf8")).toBe("earlier")
    expect(readFileSync(join(logDir, "app.log"), "utf8")).toBe("old app\nnew app\n")
    expect(gunzip(`proxy-${STAMP}-before-${TAG}.log.gz`)).toBe("old proxy\n")
  })

  it("--dry-run はログの dir を変えず、名前の変更と gzip を表示するだけにする", () => {
    const run = deploySh(["--dry-run", TAG])

    expect(run.status).toBe(0)
    expect(logs()).toEqual(["app.log", "assistant-api.log", "db.log", "proxy.log", "s3.log"])
    expect(readFileSync(join(logDir, "app.log"), "utf8")).toBe("old app\n")
    expect(run.calls.filter((call) => call.startsWith("podman-compose "))).toEqual([])
    expect(run.stdout).toContain(`+ mv ${logDir}/app.log ${logDir}/app-${STAMP}-before-${TAG}.log`)
    expect(run.stdout).toContain(`+ mv ${logDir}/proxy.log ${logDir}/proxy-${STAMP}-before-${TAG}.log`)
    expect(run.stdout).toContain(`+ gzip ${logDir}/app-${STAMP}-before-${TAG}.log`)
    expect(run.stdout).toContain(`+ gzip ${logDir}/proxy-${STAMP}-before-${TAG}.log`)
  })
})

describe("scripts/deploy.sh のログの dir", () => {
  it("dir が無ければ container を作る前に作り、app と proxy のログが無くてもエラーにしない", () => {
    const run = deploySh([TAG])

    expect(run.status).toBe(0)
    expect(logs()).toEqual(["app.log", "proxy.log"])
  })

  it("--dry-run は dir を作らない", () => {
    const run = deploySh(["--dry-run", TAG])

    expect(run.status).toBe(0)
    expect(existsSync(logDir)).toBe(false)
    expect(run.stdout).toContain(`+ mkdir -p ${logDir}`)
  })

  it.each([
    ["", "HUMANDBS_LOG_DIR is not set"],
    ["~/logs", "HUMANDBS_LOG_DIR is not an absolute path"],
    ["logs", "HUMANDBS_LOG_DIR is not an absolute path"],
  ])("HUMANDBS_LOG_DIR が「%s」なら、何も変えずにエラーで終わる", (value, message) => {
    write(join(deployment, ".env"), envFile(value))

    const run = deploySh([TAG])

    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain(message)
    expect(run.calls.filter((call) => !call.startsWith("podman container exists "))).toEqual([])
    expect(existsSync(dataDir)).toBe(false)
  })
})
