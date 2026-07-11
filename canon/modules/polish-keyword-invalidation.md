---
title: Polish keyword invalidation
updated: 2026-07-06
status: verified
---

# Polish keyword invalidation

`PolishPanel`'s keyword-change effect invalidates a showing polish result by comparing a **JSON value-key**
(`JSON.stringify(keywordValues)`), NOT the keywords array reference. A reference compare falsely wiped the
just-streamed result on ~every polish (with sync on), because the sync reconcile re-applies keywords with a
fresh array of identical content every cycle (see [[Sync reconcile side-effects]]). Comparing the value-key
means a same-content re-set does not reset, while a real keyword change still resets + re-arms. Bug #11,
fixed v0.23.3, with RED→GREEN regression tests.

**Verified.** `src/components/polish/PolishPanel.tsx` uses the value-key (`keywordsKey = JSON.stringify(keywordValues)`)
on 2026-07-06.

**Sources.** [[session b7bfaa95-1d39-4240-bd4a-2e9eb028a55a · 2026-07-06]]
