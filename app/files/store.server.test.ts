import { createServer, type Server, type Socket } from "node:net"

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3"
import { afterEach, describe, expect, it } from "vitest"

import { STORE_TIMEOUTS, storeClientOptions } from "./store.server"

/**
 * A store that takes the connection and never answers — a process stopped
 * with its port still open, a disk that has stopped responding. Refused
 * connections fail on their own; this is the case that waits.
 */
let silent: { server: Server, sockets: Set<Socket> } | null = null

afterEach(async () => {
  if (silent === null) return
  for (const socket of silent.sockets) socket.destroy()
  await new Promise((done) => silent?.server.close(done))
  silent = null
})

async function silentStore(): Promise<string> {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
  })
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  silent = { server, sockets }
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("no port")
  return `http://127.0.0.1:${String(address.port)}`
}

describe("the file store's client", () => {
  it("gives up on a store that never answers, rather than waiting on it for good", async () => {
    const endpoint = await silentStore()
    const client = new S3Client(storeClientOptions(
      { endpoint, accessKeyId: "id", secretAccessKey: "secret" },
      { connection: 200, request: 300 },
    ))
    const started = Date.now()

    await expect(client.send(new ListObjectsV2Command({ Bucket: "humandbs-public" }))).rejects.toThrow()

    // Three attempts, each cut at the request's bound.
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  /**
   * A page that lists a prefix is behind a proxy that gives up after a minute;
   * the store has to be given up on first, so the page leaves the section out
   * rather than failing whole.
   */
  it("gives up on every attempt of an ordinary request well within the proxy's minute", () => {
    const attempts = 3
    expect(STORE_TIMEOUTS.connection + STORE_TIMEOUTS.request * attempts).toBeLessThan(60_000)
  })
})
