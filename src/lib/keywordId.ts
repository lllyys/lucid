// Purpose: the deterministic, collision-FREE id for a polish keyword (#9). A keyword's identity IS
// its value: the same value always maps to the same id, so two devices that independently add the
// same keyword converge to one synced entity. Pure + side-effect-free (NOT in the store module) so
// the sync layer can validate keyword ids without pulling the Zustand store in as an import side
// effect. We ENCODE the (already-trimmed) value as fixed-width (4-hex) per UTF-16 code unit rather
// than hash it — a hash (e.g. 32-bit djb2) can collide, and since dedup is by value, a collision
// would wrongly merge two distinct keywords. This encoding is a true bijection over UTF-16 sequences
// (distinct values → distinct ids) and never throws (unlike encodeURIComponent, which rejects lone
// surrogates), keeping addKeyword/migrateKeywords crash-proof on any string.

export function keywordId(value: string): string {
  let id = 'kw_'
  for (let i = 0; i < value.length; i++) id += value.charCodeAt(i).toString(16).padStart(4, '0')
  return id
}
