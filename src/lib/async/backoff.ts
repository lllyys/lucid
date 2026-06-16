// Purpose: generic async/timing primitives shared by the provider retry layer (rule 65 §4) AND the
// self-hosted sync layer (#9) — an abortable sleep + jittered exponential backoff — extracted here so
// neither feature reaches into the other's internals (AGENTS.md: keep features local; avoid cross-feature
// imports unless truly shared). No domain types live here.

/** Resolves after `ms`, or early (without rejecting) when `signal` aborts. */
export function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const settle = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', settle)
      resolve()
    }
    const timer = setTimeout(settle, ms)
    signal?.addEventListener('abort', settle)
  })
}

/** Coerce a delay to a finite, non-negative, bounded value before it reaches a timer. */
export function clampMs(ms: number, max: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.min(ms, max)
}

/** Jittered exponential backoff: `clampMs(random() * min(base * 2^attempt, max), max)`. */
export function expBackoff(attemptIndex: number, base: number, max: number, random: () => number): number {
  const exp = Math.min(base * 2 ** attemptIndex, max)
  return clampMs(random() * exp, max)
}
