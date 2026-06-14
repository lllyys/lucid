// Phase-0 probe (rule 60 §7) for feature #2 WI-4/WI-5.
// Validates the jsdiff v9 + Intl.Segmenter assumptions the wordDiff design rests on,
// BEFORE WI-1 commits. Run: node dev-docs/grills/feature-2/diff-segmenter-probe.mjs
// PASS = every assertion below holds; the chosen diff size threshold is printed.

import * as Diff from 'diff'

let pass = true
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) pass = false
}

// 1. diffArrays accepts PRE-TOKENIZED arrays and returns Change[] {value:[],added,removed}.
{
  const a = ['the', ' ', 'quick', ' ', 'brown', ' ', 'fox']
  const b = ['the', ' ', 'slow', ' ', 'brown', ' ', 'fox']
  const parts = Diff.diffArrays(a, b)
  const added = parts.filter((p) => p.added).flatMap((p) => p.value)
  const removed = parts.filter((p) => p.removed).flatMap((p) => p.value)
  ok('diffArrays takes token arrays', Array.isArray(parts) && parts.every((p) => Array.isArray(p.value)))
  ok('diffArrays classifies add/del', added.includes('slow') && removed.includes('quick'),
    `added=${JSON.stringify(added)} removed=${JSON.stringify(removed)}`)
  // reconstruct the "result" exactly from same+added segments (the applyDiff whole-accept invariant)
  const result = parts.filter((p) => !p.removed).flatMap((p) => p.value).join('')
  ok('whole-accept reproduces result exactly', result === b.join(''))
}

// 2. maxEditLength: diffArrays returns undefined when the edit distance exceeds the bound.
{
  const a = Array.from({ length: 400 }, (_, i) => `a${i}`)
  const b = Array.from({ length: 400 }, (_, i) => `b${i}`) // fully disjoint => large edit distance
  const bounded = Diff.diffArrays(a, b, { maxEditLength: 5 })
  ok('maxEditLength exceeded => undefined', bounded === undefined, `got ${typeof bounded}`)
  const unbounded = Diff.diffArrays(a, b)
  ok('no bound => returns a result', Array.isArray(unbounded))
}

// 3. intlSegmenter is a diffWords option, NOT diffArrays (we must tokenize ourselves for diffArrays).
{
  ok('diffWords exists', typeof Diff.diffWords === 'function')
  ok('diffArrays exists', typeof Diff.diffArrays === 'function')
  // diffWords accepts intlSegmenter; diffArrays ignores any segmenter (operates on given tokens).
  const seg = new Intl.Segmenter('zh', { granularity: 'word' })
  let wordsOk = true
  try { Diff.diffWords('北京欢迎你', '上海欢迎你', { intlSegmenter: seg }) } catch { wordsOk = false }
  ok('diffWords accepts intlSegmenter', wordsOk)
}

// 4. Intl.Segmenter determinism: identical input => identical segmentation within this runtime.
{
  const seg = new Intl.Segmenter(undefined, { granularity: 'word' })
  const tokens = (s) => [...seg.segment(s)].map((x) => x.segment)
  const cjk = '该模型在推理阶段通过注意力机制动态调整权重'
  const t1 = tokens(cjk), t2 = tokens(cjk)
  ok('Segmenter deterministic (CJK)', JSON.stringify(t1) === JSON.stringify(t2), `${t1.length} segments`)
  const mixed = 'During inference 推理 the model uses attention'
  ok('Segmenter handles mixed-script', tokens(mixed).join('') === mixed, 'round-trips losslessly')
  // grapheme safety: emoji + combining marks must not split mid-cluster when we join back
  const emoji = 'café 👨‍👩‍👧 done'
  ok('Segmenter round-trips emoji/combining', tokens(emoji).join('') === emoji)
}

// 5. Worst-case performance: pin the char threshold for the coarse-fallback preflight (D3-1/D5-1).
{
  const seg = new Intl.Segmenter(undefined, { granularity: 'word' })
  const mkTokens = (n) => {
    const words = []
    let len = 0
    let i = 0
    while (len < n) { const w = `word${i++} `; words.push(...[...seg.segment(w)].map((x) => x.segment)); len += w.length }
    return words
  }
  for (const n of [10_000, 50_000, 100_000]) {
    const a = mkTokens(n)
    const b = a.slice()
    for (let i = 0; i < b.length; i += 7) b[i] = b[i] + 'X' // ~14% changed
    const start = process.hrtime.bigint()
    const parts = Diff.diffArrays(a, b, { maxEditLength: Math.ceil(a.length * 0.5) })
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    const status = parts === undefined ? 'bound-exceeded(coarse-fallback)' : `${parts.length} parts`
    console.log(`PERF  ${n} chars (~${a.length} tokens): ${ms.toFixed(1)}ms — ${status}`)
  }
}

console.log(`\n${pass ? 'PHASE-0 PASS' : 'PHASE-0 FAIL'}`)
process.exit(pass ? 0 : 1)
