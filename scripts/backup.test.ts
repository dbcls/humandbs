import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

const SCRIPT = join(import.meta.dirname, "backup.sh")
const ACCESS_KEY = "access-key-of-the-test"
const SECRET_KEY = "secret-key-of-the-test"

/**
 * podman as backup.sh reaches it. Each call is recorded with the keys it found
 * in its environment and whether the lock's descriptor was open in it;
 * pg_dump prints a stand-in archive and pg_restore reads it back. `STUB_*`
 * variables make a step fail.
 */
const PODMAN_STUB = `#!/bin/sh
printf '%s\\n' "$*" >> "$STUB_LOG"
printf '%s %s\\n' "\${RCLONE_CONFIG_STORE_ACCESS_KEY_ID:-}" "\${RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY:-}" >> "$STUB_ENV_LOG"
if [ -e /proc/$$/fd/9 ]; then echo "$*" >> "$STUB_FD_LOG"; fi
case "$*" in
  "container exists "*) [ -z "\${STUB_NO_DB:-}" ]; exit $? ;;
  *" pg_dump "*) printf 'PGDMP stand-in'; exit 0 ;;
  *" pg_restore --list"*) [ -z "\${STUB_UNREADABLE_DUMP:-}" ] && head -c 5 | grep -q PGDMP; exit $? ;;
  "run "*) exit "\${STUB_RCLONE_EXIT:-0}" ;;
esac
exit 0
`

/** The date in Japan, `offset` days from today, as the script names its entries. */
function day(offset: number): string {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
  return format.format(new Date(Date.now() + offset * 86_400_000)).replaceAll("-", "")
}

let root: string
let deployment: string
let backup: string

function write(path: string, content = "x"): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, content)
}

function envFile(backupDir: string): string {
  return [
    "HUMANDBS_POSTGRES_USER=humandbs",
    "HUMANDBS_POSTGRES_DB=humandbs",
    "HUMANDBS_S3_ENDPOINT=http://s3:8333",
    `HUMANDBS_S3_ACCESS_KEY=${ACCESS_KEY}`,
    `HUMANDBS_S3_SECRET_KEY=${SECRET_KEY}`,
    `HUMANDBS_BACKUP_DIR=${backupDir}`,
    "",
  ].join("\n")
}

function lines(path: string): string[] {
  return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((line) => line !== "") : []
}

function backupSh(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync("sh", [SCRIPT, ...args], {
    cwd: deployment,
    encoding: "utf8",
    env: {
      PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`,
      HOME: root,
      TZ: "Asia/Tokyo",
      STUB_LOG: join(root, "calls"),
      STUB_ENV_LOG: join(root, "keys"),
      STUB_FD_LOG: join(root, "fd9"),
      ...env,
    },
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls: lines(join(root, "calls")),
    rcloneCalls: lines(join(root, "calls")).filter((call) => call.startsWith("run ")),
    keysSeen: lines(join(root, "keys")),
    callsWithLockOpen: lines(join(root, "fd9")),
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "backup-sh-"))
  deployment = join(root, "humandbs-production")
  backup = join(root, "backup")
  write(join(deployment, ".env"), envFile(backup))
  write(join(root, "bin", "podman"), PODMAN_STUB)
  spawnSync("chmod", ["+x", join(root, "bin", "podman")])
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("scripts/backup.sh", () => {
  it("DB の dump・.env のコピー・last-success を作り、2 つの bucket を current/ に sync して、消えたものを deleted/<今日>/ に移す", () => {
    const run = backupSh([])

    expect(run.status).toBe(0)
    const [dump, ...others] = readdirSync(join(backup, "db"))
    expect(others).toEqual([])
    expect(dump).toMatch(new RegExp(`^${day(0)}-\\d{6}\\.dump$`))
    expect(readFileSync(join(backup, "db", dump ?? ""), "utf8")).toBe("PGDMP stand-in")
    expect(readFileSync(join(backup, "env", `${day(0)}.env`), "utf8")).toBe(envFile(backup))
    expect(statSync(join(backup, "env", `${day(0)}.env`)).mode & 0o777).toBe(0o600)
    expect(existsSync(join(backup, "last-success"))).toBe(true)
    for (const bucket of ["files", "private"]) {
      expect(run.rcloneCalls).toContainEqual(expect.stringMatching(new RegExp(
        `^run --rm --network humandbs-production_default .* -v ${backup}/files:/backup docker\\.io/rclone/rclone:\\S+ --metadata sync `
        + `.*--backup-dir /backup/deleted/${day(0)}/${bucket} .*store:${bucket} /backup/current/${bucket}$`,
      )))
    }
  })

  it("S3 の鍵はコマンドの引数に書かず、変数の名前だけを渡して値は環境変数から podman に渡す", () => {
    const run = backupSh([])

    expect(run.status).toBe(0)
    expect(run.rcloneCalls).toHaveLength(2)
    for (const call of run.calls) {
      expect(call).not.toContain(ACCESS_KEY)
      expect(call).not.toContain(SECRET_KEY)
    }
    for (const call of run.rcloneCalls) {
      expect(call).toContain("-e RCLONE_CONFIG_STORE_ACCESS_KEY_ID -e RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY ")
    }
    expect(run.keysSeen).toContain(`${ACCESS_KEY} ${SECRET_KEY}`)
    expect(run.stdout + run.stderr).not.toContain(SECRET_KEY)
  })

  it("podman を lock の fd を閉じて起動する", () => {
    const run = backupSh([])

    expect(run.status).toBe(0)
    expect(run.calls.length).toBeGreaterThan(3)
    expect(run.callsWithLockOpen).toEqual([])
  })

  it("dump を読み戻せなければ、.dump にせず、bucket もコピーせず、last-success を書かずに止まる", () => {
    const run = backupSh([], { STUB_UNREADABLE_DUMP: "1" })

    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain("cannot be read back")
    expect(readdirSync(join(backup, "db"))).toEqual([expect.stringMatching(/\.dump\.partial$/)])
    expect(run.rcloneCalls).toEqual([])
    expect(existsSync(join(backup, "last-success"))).toBe(false)
  })

  it("bucket のコピーが失敗すると、last-success を書かず、古いものも消さずに止まる", () => {
    const old = join(backup, "db", `${day(-31)}-043000.dump`)
    write(old)

    const run = backupSh([], { STUB_RCLONE_EXIT: "1" })

    expect(run.status).not.toBe(0)
    expect(run.rcloneCalls).toHaveLength(1)
    expect(existsSync(join(backup, "last-success"))).toBe(false)
    expect(existsSync(old)).toBe(true)
  })

  it("30 日より前の日付で始まる dump・.env・deleted/ の日の dir を消し、30 日前の日のものと日付で始まらないものは残す", () => {
    const removed = [
      join(backup, "db", `${day(-31)}-235959.dump`),
      join(backup, "db", `${day(-31)}-043000.dump.partial`),
      join(backup, "db", `${day(-400)}-043000.dump`),
      join(backup, "env", `${day(-31)}.env`),
      join(backup, "files", "deleted", day(-31)),
    ]
    const kept = [
      join(backup, "db", `${day(-30)}-000000.dump`),
      join(backup, "db", "before-restore.dump"),
      join(backup, "env", `${day(-30)}.env`),
      join(backup, "files", "deleted", day(-30)),
      join(backup, "files", "current", "files", "hum0009", `${day(-31)}.xlsx`),
    ]
    for (const path of [...removed, ...kept]) {
      write(path.includes("deleted") ? join(path, "files", "hum0009", "a.pdf") : path)
    }

    const run = backupSh([])

    expect(run.status).toBe(0)
    expect(removed.filter((path) => existsSync(path))).toEqual([])
    expect(kept.filter((path) => !existsSync(path))).toEqual([])
  })

  it("--dry-run は backup の dir に何も作らず、変える操作を表示するだけにする", () => {
    const run = backupSh(["--dry-run"])

    expect(run.status).toBe(0)
    expect(existsSync(backup)).toBe(false)
    expect(run.rcloneCalls).toEqual([])
    expect(run.stdout).toContain("pg_dump -Fc")
    expect(run.stdout).toMatch(/\+ podman run --rm .* sync /)
    expect(run.stdout).not.toContain(SECRET_KEY)
  })

  it("ほかの実行が lock を持っているあいだは、何もせずにエラーで終わる", async () => {
    mkdirSync(backup, { recursive: true })
    const lockPath = join(backup, ".lock")
    const holder = spawn("flock", [lockPath, "sleep", "30"], { detached: true, stdio: "ignore" })
    try {
      while (spawnSync("flock", ["-n", lockPath, "true"]).status === 0) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }

      const run = backupSh([])

      expect(run.status).not.toBe(0)
      expect(run.stderr).toContain("another scripts/backup.sh is running")
      expect(existsSync(join(backup, "db"))).toBe(false)
      expect(run.rcloneCalls).toEqual([])
    } finally {
      process.kill(-(holder.pid ?? 0), "SIGKILL")
    }
  })

  it("HUMANDBS_BACKUP_DIR が空ならエラーで終わる", () => {
    write(join(deployment, ".env"), envFile(""))

    const run = backupSh([])

    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain("HUMANDBS_BACKUP_DIR is not set")
    expect(run.calls).toEqual([])
  })

  it("DB の container が無ければ何もせずにエラーで終わる", () => {
    const run = backupSh([], { STUB_NO_DB: "1" })

    expect(run.status).not.toBe(0)
    expect(existsSync(backup)).toBe(false)
    expect(run.rcloneCalls).toEqual([])
  })
})

describe("scripts/backup.sh restore-files", () => {
  beforeEach(() => {
    write(join(backup, "files", "current", "files", "hum0009", "a.pdf"))
    write(join(backup, "files", "current", "private", "entity-1", "b.txt"))
    write(join(backup, "files", "deleted", "20261015", "files", "hum0009", "c.xlsx"))
  })

  it.each([
    ["current/files/hum0009/", "copy", "/backup/current/files/hum0009/", "store:files/hum0009/"],
    ["current/files/hum0009", "copy", "/backup/current/files/hum0009", "store:files/hum0009"],
    ["current/files", "copy", "/backup/current/files", "store:files/"],
    ["current/private/entity-1/b.txt", "copyto", "/backup/current/private/entity-1/b.txt", "store:private/entity-1/b.txt"],
    ["deleted/20261015/files/hum0009/c.xlsx", "copyto", "/backup/deleted/20261015/files/hum0009/c.xlsx", "store:files/hum0009/c.xlsx"],
    ["deleted/20261015/files/", "copy", "/backup/deleted/20261015/files/", "store:files/"],
  ])("%s を同じ bucket と key に、backup を読み取り専用で mount してコピーする", (path, verb, from, to) => {
    const run = backupSh(["restore-files", path])

    expect(run.status).toBe(0)
    expect(run.rcloneCalls).toHaveLength(1)
    expect(run.rcloneCalls[0]).toContain(` -v ${backup}/files:/backup:ro `)
    expect(run.rcloneCalls[0]).toMatch(new RegExp(` --metadata ${verb} -v ${from} ${to}$`))
    expect(run.callsWithLockOpen).toEqual([])
  })

  it.each([
    [""],
    ["/etc/passwd"],
    ["current/../../etc"],
    ["current/files/../private/entity-1"],
    ["current/./files"],
    ["current//files/hum0009"],
    ["current/files//hum0009"],
    ["current/other/x"],
    ["deleted/2026101/files/hum0009"],
    ["deleted/20261015"],
    ["deleted/files/hum0009"],
    ["elsewhere/files/hum0009"],
    ["current/files/hum0404/missing.txt"],
  ])("「%s」はエラーにし、ファイルストアに書かない", (path) => {
    const run = backupSh(["restore-files", path])

    expect(run.status).not.toBe(0)
    expect(run.rcloneCalls).toEqual([])
  })
})
