// Purpose: a dependency-free RFC-4122 v4 UUID generator shared by the stores (#9 / bug #55). Used for
// globally-unique entity ids so they never collide — across reloads or devices. crypto.randomUUID is
// the fast path, but it is only defined in SECURE contexts (https / localhost); a self-hosted lucid
// served over plain http on a LAN (e.g. http://192.168.x.x) has no randomUUID. crypto.getRandomValues
// IS available in insecure contexts, so we fall back to building a v4 uuid from 16 random bytes —
// otherwise minting an id would throw and break newSession/addTask/addTerm on a LAN deployment.

export function randomUuid(): string {
  const c = globalThis.crypto
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  // Fallback (insecure-context): RFC-4122 v4 from getRandomValues.
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 10xx
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}
