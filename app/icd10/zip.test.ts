import { describe, expect, it } from "vitest"

import { readZipMember } from "./zip"

/**
 * A zip archive built here rather than committed. What is under test is the
 * reading of a format, and a fixture would only prove that one file can be read.
 */
async function archive(
  members: { name: string, body: string, deflate: boolean }[],
): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const local: number[] = []
  const central: number[] = []
  const u16 = (value: number) => [value & 0xff, (value >> 8) & 0xff]
  const u32 = (value: number) => [...u16(value & 0xffff), ...u16((value >>> 16) & 0xffff)]

  for (const member of members) {
    const name = encoder.encode(member.name)
    const raw = encoder.encode(member.body)
    const body = member.deflate ? await deflateRaw(raw) : raw
    const offset = local.length
    local.push(
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(member.deflate ? 8 : 0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(raw.length),
      ...u16(name.length), ...u16(0), ...name, ...body,
    )
    central.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(member.deflate ? 8 : 0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(raw.length),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset), ...name,
    )
  }

  const comment = encoder.encode("a trailing comment")
  return new Uint8Array([
    ...local,
    ...central,
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(members.length), ...u16(members.length),
    ...u32(central.length), ...u32(local.length),
    ...u16(comment.length), ...comment,
  ])
}

async function deflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe("reading a member of a zip", () => {
  it("finds the one asked for among several, past a trailing comment", async () => {
    const zip = await archive([
      { name: "chapters.txt", body: "chapters", deflate: true },
      { name: "codes.txt", body: "A00;Cholera", deflate: true },
      { name: "groups.txt", body: "groups", deflate: true },
    ])
    expect(text(await readZipMember(zip, "codes.txt"))).toBe("A00;Cholera")
  })

  it("reads a stored member as well as a deflated one", async () => {
    const zip = await archive([{ name: "codes.txt", body: "A00;Cholera", deflate: false }])
    expect(text(await readZipMember(zip, "codes.txt"))).toBe("A00;Cholera")
  })

  it("keeps a member the size of the real distribution intact", async () => {
    const body = Array.from({ length: 5000 }, (_, i) => `A${i};title ${i}`).join("\n")
    const zip = await archive([{ name: "codes.txt", body, deflate: true }])
    expect(text(await readZipMember(zip, "codes.txt"))).toBe(body)
  })

  // A caller that silently got nothing would replace the dictionary with an
  // empty one, and every code would then read as not existing.
  it("refuses rather than answering with nothing when the member is not there", async () => {
    const zip = await archive([{ name: "codes.txt", body: "x", deflate: true }])
    await expect(readZipMember(zip, "missing.txt")).rejects.toThrow("missing.txt")
  })

  it("refuses something that is not an archive at all", async () => {
    await expect(readZipMember(new TextEncoder().encode("not a zip"), "codes.txt"))
      .rejects.toThrow()
  })
})
