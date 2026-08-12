/**
 * Reading one member out of a zip archive.
 *
 * WHO distributes the classification as a zip holding three files, of which one
 * is wanted. That is the only reason this exists — a dependency for a format
 * read once at setup is not worth carrying, and the two compression methods a
 * zip of text uses are both in the platform already.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_FILE_HEADER = 0x02014b50
const LOCAL_FILE_HEADER = 0x04034b50

const STORED = 0
const DEFLATED = 8

interface Member {
  name: string
  method: number
  offset: number
  compressedSize: number
}

/**
 * The bytes of one member, decompressed. Throws when the archive does not hold
 * it — a caller that silently got nothing would write an empty dictionary.
 */
export async function readZipMember(archive: Uint8Array, name: string): Promise<Uint8Array> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const member = directory(archive, view).find((one) => one.name === name)
  if (member === undefined) throw new Error(`the archive holds no ${name}`)

  if (view.getUint32(member.offset, true) !== LOCAL_FILE_HEADER) {
    throw new Error(`${name} does not start with a local file header`)
  }
  // The local header repeats the name and may carry a different extra field
  // from the central one, so its own lengths decide where the bytes begin.
  const start = member.offset + 30
    + view.getUint16(member.offset + 26, true)
    + view.getUint16(member.offset + 28, true)
  const body = archive.subarray(start, start + member.compressedSize)

  if (member.method === STORED) return body
  if (member.method !== DEFLATED) throw new Error(`${name} uses compression ${member.method}`)
  return inflateRaw(body)
}

/** Every member the central directory lists. */
function directory(archive: Uint8Array, view: DataView): Member[] {
  const end = endOfCentralDirectory(view, archive.length)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const members: Member[] = []
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(at, true) !== CENTRAL_FILE_HEADER) {
      throw new Error("the central directory is not where it says it is")
    }
    const nameLength = view.getUint16(at + 28, true)
    members.push({
      name: new TextDecoder().decode(archive.subarray(at + 46, at + 46 + nameLength)),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      offset: view.getUint32(at + 42, true),
    })
    at += 46 + nameLength
      + view.getUint16(at + 30, true)
      + view.getUint16(at + 32, true)
  }
  return members
}

/**
 * The record is last, but a trailing comment may follow it, so it is found by
 * scanning back from the end over the largest comment a zip can hold.
 */
function endOfCentralDirectory(view: DataView, length: number): number {
  const floor = Math.max(0, length - 0xffff - 22)
  for (let at = length - 22; at >= floor; at -= 1) {
    if (view.getUint32(at, true) === END_OF_CENTRAL_DIRECTORY) return at
  }
  throw new Error("no end of central directory record")
}

async function inflateRaw(body: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([body as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
