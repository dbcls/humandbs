import { createServer, type Server, type Socket } from "node:net"

import { afterEach, describe, expect, it } from "vitest"

import { openApplicationDb } from "./application-db.server"

/**
 * The application system's database belongs to another project and may take
 * the connection and never answer. Refused connections fail on their own; this
 * is the case that waits — and the refresh holds its runner while it does.
 */
let silent: { server: Server, sockets: Set<Socket> } | null = null

afterEach(async () => {
  if (silent === null) return
  for (const socket of silent.sockets) socket.destroy()
  await new Promise((done) => silent?.server.close(done))
  silent = null
})

async function silentDatabase(): Promise<string> {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
  })
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  silent = { server, sockets }
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("no port")
  return `postgres://reader:secret@127.0.0.1:${String(address.port)}/jgasys`
}

describe("the application database's pool", () => {
  it("gives up on a database that takes the connection and never answers, and closes", async () => {
    const pool = openApplicationDb({ url: await silentDatabase(), schema: "jgasys" }, 300)
    const started = Date.now()

    await expect(pool.query("SELECT 1")).rejects.toThrow()
    await pool.end()

    expect(Date.now() - started).toBeLessThan(2_000)
  })
})
