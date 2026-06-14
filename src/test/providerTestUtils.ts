// Test helpers for the provider layer: build byte streams, mock fetch Responses,
// and a stalling body whose stream errors when the fetch signal aborts (so the
// transport's deadline/abort paths can be exercised deterministically).
// Not under the coverage globs (src/providers|lib|stores) — pure test infra.

const encoder = new TextEncoder()

export function bytes(s: string): Uint8Array {
  return encoder.encode(s)
}

/** A ReadableStream that emits the given chunks (strings encoded UTF-8) then closes. */
export function streamFromChunks(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      const c = chunks[i++]
      controller.enqueue(typeof c === 'string' ? bytes(c) : c)
    },
  })
}

/** An async iterable of byte chunks — for readSSE unit tests. */
export async function* asyncChunks(chunks: Array<string | Uint8Array>): AsyncGenerator<Uint8Array> {
  for (const c of chunks) yield typeof c === 'string' ? bytes(c) : c
}

export function streamResponse(
  chunks: Array<string | Uint8Array>,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(streamFromChunks(chunks), {
    status: init?.status ?? 200,
    headers: init?.headers,
  })
}

/**
 * A Response whose body emits `firstChunk` then stalls forever — until the given
 * fetch `signal` aborts, at which point the body stream errors with the signal's
 * reason. Lets a timeout/abort propagate through body consumption.
 */
export function stallingResponse(firstChunk: string, signal: AbortSignal | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes(firstChunk))
      const onAbort = () => controller.error(signal?.reason ?? new DOMException('aborted', 'AbortError'))
      if (signal?.aborted) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
    },
  })
  return new Response(body, { status: 200 })
}
