/**
 * Identities the production load gives the research and datasets it makes,
 * the same on every load.
 *
 * The load empties the database and makes everything again, and a private prefix
 * in the file store is keyed by research identity. Drawn afresh each time, the
 * identities would move and leave every private file under a key nothing points
 * at. Derived from what the snapshot names them by — the hum label, the
 * dataset's own id — a second load gives back the same identities, and the
 * files stay where they are.
 *
 * They are name-based UUIDs (version 5) under a namespace of this load's own,
 * so they cannot collide with the time-ordered ones the application draws.
 */

import { createHash } from "node:crypto"

/** This load's namespace. Any fixed UUID would do; it must never change. */
const NAMESPACE = "5f0b6c1e-8a3d-4c7e-9b21-3d4e5f60718a"

function bytesOf(uuid: string): Buffer {
  return Buffer.from(uuid.replaceAll("-", ""), "hex")
}

/** RFC 9562 version 5: SHA-1 of the namespace and the name. */
export function nameBasedUuid(name: string, namespace: string = NAMESPACE): string {
  const hash = createHash("sha1").update(bytesOf(namespace)).update(name, "utf8").digest()
  const bytes = hash.subarray(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function researchIdentity(humLabel: string): string {
  return nameBasedUuid(`research:${humLabel}`)
}

export function datasetIdentity(label: string): string {
  return nameBasedUuid(`dataset:${label}`)
}
