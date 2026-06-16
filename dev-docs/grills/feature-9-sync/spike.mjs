// Phase-0 spike (rule 60 §7) for feature #9 self-hosted sync. THROWAWAY — validates the load-bearing
// assumptions of the corrected ADR before any WI commits. Run: `node dev-docs/grills/feature-9-sync/spike.mjs`.
// It exercises a REAL node:sqlite "server" (no HTTP needed — the risk is the engine + the conflict/UPSERT
// + ordering logic, not the thin REST layer) with two simulated clients.
//
// PROVES: (1) node:sqlite UPSERT + atomic monotonic rev with NO native build; (2) the server-assigned `rev`
// is the PRIMARY ordering authority so a +1h-clock device CANNOT silently overwrite a concurrent edit
// (the corrected Critical #1); (3) a stale-rev push returns a CONFLICT, not an overwrite; (4) the UPSERT is
// idempotent under crash-mid-seed re-push (no duplicate row); (5) delete-then-readd converges with no
// resurrection loop; (6) tombstone-based eviction propagates as a delete (no silent drop → no resurrection).

import { DatabaseSync } from 'node:sqlite'
import assert from 'node:assert/strict'

// ---- The "server": a dumb durable store with a server-assigned monotonic rev. ----
function makeServer() {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE entities (id TEXT PRIMARY KEY, type TEXT, payload TEXT, updatedAt INTEGER,
                                  deletedAt INTEGER, rev INTEGER NOT NULL)`)
  let revCounter = 0
  const nextRev = () => ++revCounter // monotonic, server-assigned — the ORDERING AUTHORITY

  // PUSH one op {id,type,payload,updatedAt,deletedAt,baseRev}. baseRev = the rev the client last saw for
  // this id (0 = expect-new). Optimistic concurrency: if the server row advanced past baseRev → CONFLICT.
  function push(op) {
    const existing = db.prepare('SELECT * FROM entities WHERE id=?').get(op.id)
    if (!existing) {
      const rev = nextRev()
      db.prepare(
        'INSERT INTO entities (id,type,payload,updatedAt,deletedAt,rev) VALUES (?,?,?,?,?,?)',
      ).run(op.id, op.type, op.payload, op.updatedAt, op.deletedAt ?? null, rev)
      return { status: 'applied', rev }
    }
    if (existing.rev !== op.baseRev) {
      // Server advanced since the client's base — do NOT overwrite; return the authoritative row.
      return { status: 'conflict', server: existing }
    }
    const rev = nextRev()
    db.prepare('UPDATE entities SET payload=?,updatedAt=?,deletedAt=?,rev=? WHERE id=? AND rev=?').run(
      op.payload, op.updatedAt, op.deletedAt ?? null, rev, op.id, op.baseRev,
    )
    return { status: 'applied', rev }
  }
  const pull = (since) => {
    const changes = db.prepare('SELECT * FROM entities WHERE rev>? ORDER BY rev').all(since)
    return { changes, maxRev: changes.length ? changes[changes.length - 1].rev : since }
  }
  const get = (id) => db.prepare('SELECT * FROM entities WHERE id=?').get(id)
  const count = () => db.prepare('SELECT COUNT(*) c FROM entities').get().c
  return { push, pull, get, count }
}

// ---- A simulated client: local state + last-seen rev per id; server-authoritative merge. ----
function makeClient(server, clockOffsetMs = 0) {
  const local = new Map() // id -> { type, payload, updatedAt, deletedAt, baseRev }
  const now = () => Date.now() + clockOffsetMs // a skewed clock only affects `updatedAt` METADATA
  const edit = (id, type, payload) => local.set(id, { type, payload, updatedAt: now(), deletedAt: null, baseRev: local.get(id)?.baseRev ?? 0 })
  const del = (id) => { const e = local.get(id); local.set(id, { ...e, deletedAt: now() }) }
  function pull(since = 0) {
    const { changes } = server.pull(since)
    for (const r of changes) local.set(r.id, { type: r.type, payload: r.payload, updatedAt: r.updatedAt, deletedAt: r.deletedAt, baseRev: r.rev })
    return changes
  }
  function push(id) {
    const e = local.get(id)
    const res = server.push({ id, type: e.type, payload: e.payload, updatedAt: e.updatedAt, deletedAt: e.deletedAt, baseRev: e.baseRev })
    if (res.status === 'applied') local.set(id, { ...e, baseRev: res.rev })
    return res
  }
  return { local, edit, del, push, pull }
}

let passed = 0
const ok = (label) => { console.log('  PASS:', label); passed++ }

// ---- (1) Engine: UPSERT + monotonic rev on node:sqlite, no native build ----
{
  const s = makeServer()
  assert.equal(s.push({ id: 'a', type: 't', payload: '1', updatedAt: 1, baseRev: 0 }).rev, 1)
  assert.equal(s.push({ id: 'a', type: 't', payload: '2', updatedAt: 2, baseRev: 1 }).rev, 2)
  assert.equal(s.get('a').payload, '2')
  ok('node:sqlite UPSERT + atomic monotonic rev (no native build)')
}

// ---- (2)+(3) Skew-immunity: a +1h clock CANNOT silently overwrite; stale-rev → conflict ----
{
  const s = makeServer()
  const A = makeClient(s, 0) // correct clock
  const B = makeClient(s, 60 * 60 * 1000) // +1 hour fast clock
  // Seed X, both devices sync to it.
  A.edit('X', 'session', 'v0'); A.push('X')
  A.pull(0); B.pull(0)
  const baseB = B.local.get('X').baseRev
  // Both edit X concurrently OFFLINE. A pushes first.
  A.edit('X', 'session', 'A-edit'); const ra = A.push('X')
  assert.equal(ra.status, 'applied')
  // B (fast clock) now pushes its concurrent edit against its STALE base.
  B.edit('X', 'session', 'B-edit'); const rb = B.push('X')
  assert.equal(rb.status, 'conflict', 'fast-clock B must CONFLICT, not silently overwrite')
  assert.equal(s.get('X').payload, 'A-edit', "B's +1h clock must NOT have won silently")
  assert.equal(baseB, 1)
  ok('server-rev ordering: +1h-clock device cannot SILENTLY overwrite (conflict surfaced, not applied)')
  // Deterministic resolution: B re-pulls, re-applies, re-pushes — last writer wins by SERVER ORDER, not clock.
  B.pull(0); B.edit('X', 'session', 'B-edit'); const rb2 = B.push('X')
  assert.equal(rb2.status, 'applied')
  assert.equal(s.get('X').payload, 'B-edit')
  ok('conflict resolves deterministically by server arrival order (clock-independent)')
}

// ---- (4) Idempotent UPSERT under crash-mid-seed re-push (no duplicate) ----
{
  const s = makeServer()
  const op = { id: 'k1', type: 'keyword', payload: 'inference', updatedAt: 5, baseRev: 0 }
  assert.equal(s.push(op).status, 'applied')
  const re = s.push(op) // crash before ack → client re-pushes the SAME seed op (baseRev still 0)
  assert.equal(re.status, 'conflict') // row now exists at rev>0 → conflict, client reconciles to identical value
  assert.equal(s.count(), 1, 'crash-mid-seed re-push must NOT create a duplicate row')
  assert.equal(s.get('k1').payload, 'inference')
  ok('idempotent seed: crash-mid-seed re-push yields no duplicate')
}

// ---- (5) delete-then-readd converges, no resurrection loop ----
{
  const s = makeServer()
  const A = makeClient(s), B = makeClient(s)
  A.edit('T', 'term', 'API'); A.push('T'); A.pull(0); B.pull(0)
  A.del('T'); A.push('T') // tombstone
  B.pull(0) // B observes the tombstone (a row with deletedAt, NOT a missing row)
  assert.ok(B.local.get('T').deletedAt, 'B must observe the delete as a tombstone, not a resurrection')
  // B legitimately re-adds T (after seeing the tombstone) — later server order wins, converges alive.
  B.edit('T', 'term', 'API'); B.push('T')
  A.pull(0)
  assert.equal(s.get('T').deletedAt, null)
  assert.equal(A.local.get('T').deletedAt, null) // A converges to alive — no oscillation
  ok('delete-then-readd converges (no resurrection loop; causal/server-rev order)')
}

// ---- (6) Eviction as a tombstone propagates as a delete (no silent drop) ----
{
  const s = makeServer()
  const A = makeClient(s), B = makeClient(s)
  A.edit('S', 'session', 'old'); A.push('S'); A.pull(0); B.pull(0)
  // Eviction: A removes S as a TOMBSTONE (the corrected design — not a silent localStorage drop).
  A.del('S'); A.push('S')
  const before = B.local.get('S').deletedAt
  B.pull(0)
  assert.equal(before, null)
  assert.ok(B.local.get('S').deletedAt, 'tombstoned eviction must reach B as a delete (no resurrection)')
  ok('eviction-as-tombstone propagates as a delete (no silent-drop resurrection)')
}

console.log(`\nPhase-0 spike: ${passed}/6 invariants PASS — corrected server-rev ordering validated.`)
