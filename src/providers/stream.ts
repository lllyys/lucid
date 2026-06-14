// Purpose: the streaming HTTP transport (rule 65 §3). `fetchStream` composes the
// caller's abort signal with a request deadline (kept active through body
// consumption), throws ProviderHttpError on non-2xx, yields raw body bytes, and
// runs idempotent best-effort cleanup in finally. `readSSE` frames those bytes
// into SSE event payloads (vendor-agnostic): a streaming TextDecoder buffers
// partial/multi-byte chunks, events are split on a blank line (CR/LF/CRLF), and
// a single event's multiple `data:` fields are joined with \n. The vendor parser
// (anthropicProvider) decides completion — `[DONE]` is only an OpenAI sentinel.

/** Non-2xx HTTP response. collectStream maps it via errorFromStatus(status, retryAfter). */
export class ProviderHttpError extends Error {
  readonly status: number
  readonly retryAfter: string | null
  readonly bodyText: string
  constructor(status: number, retryAfter: string | null, bodyText: string) {
    super(`HTTP ${status}`)
    this.name = 'ProviderHttpError'
    this.status = status
    this.retryAfter = retryAfter
    this.bodyText = bodyText
  }
}

export interface FetchStreamOptions {
  signal?: AbortSignal
  timeoutMs?: number
  fetch?: typeof fetch
}

export async function* fetchStream(
  url: string,
  init: RequestInit,
  options: FetchStreamOptions = {},
): AsyncGenerator<Uint8Array> {
  const fetchFn = options.fetch ?? globalThis.fetch
  const controller = new AbortController()
  const onAbort = () => controller.abort(options.signal?.reason)
  if (options.signal) {
    if (options.signal.aborted) controller.abort(options.signal.reason)
    else options.signal.addEventListener('abort', onAbort, { once: true })
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  if (options.timeoutMs !== undefined) {
    timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), options.timeoutMs)
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      throw new ProviderHttpError(res.status, res.headers.get('retry-after'), bodyText)
    }
    if (!res.body) return
    reader = res.body.getReader()
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      yield result.value
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    if (options.signal) options.signal.removeEventListener('abort', onAbort)
    // Fire-and-forget: awaiting cancel() could hang and mask the primary outcome.
    // The .catch keeps the rejection from going unhandled (idempotent best-effort).
    // releaseLock then frees the reader so a never-settling cancel can't retain the
    // locked stream; cleanup runs only with no in-flight read, so it won't throw.
    if (reader) {
      void reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    if (!controller.signal.aborted) controller.abort()
  }
}

/**
 * Frame a byte stream into SSE event payloads. Line-based so a CRLF is one
 * terminator (never two), a blank line ends an event, and a single event's
 * multiple `data:` fields join with \n. A trailing lone `\r` is deferred — it
 * may be the first half of a `\r\n` split across two reads.
 */
export async function* readSSE(source: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  const LINE = /\r\n|\r|\n/g
  let buffer = ''
  let dataLines: string[] = []

  function dispatch(): string | undefined {
    if (dataLines.length === 0) return undefined
    const data = dataLines.join('\n')
    dataLines = []
    return data // vendor-agnostic: e.g. the OpenAI `[DONE]` sentinel is the OpenAI adapter's concern (#2)
  }

  function handleLine(line: string): string | undefined {
    if (line === '') return dispatch() // blank line ends the event
    if (line.startsWith(':')) return undefined // comment line
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    if (field !== 'data') return undefined // ignore non-data fields (event:/id:/retry:)
    // SSE spec: a bare `data` field (no colon) carries an empty value.
    dataLines.push(colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, ''))
    return undefined
  }

  for await (const chunk of source) {
    buffer += decoder.decode(chunk, { stream: true })
    LINE.lastIndex = 0
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = LINE.exec(buffer)) !== null) {
      // Defer a lone trailing CR — it may be the first half of a split CRLF.
      if (m[0] === '\r' && m.index + 1 === buffer.length) break
      const out = handleLine(buffer.slice(lastIndex, m.index))
      lastIndex = LINE.lastIndex
      if (out !== undefined) yield out
    }
    buffer = buffer.slice(lastIndex)
  }

  buffer += decoder.decode()
  if (buffer.endsWith('\r')) buffer = buffer.slice(0, -1)
  // A non-empty trailing buffer is a final unterminated line (never a blank line,
  // so handleLine only buffers it); the pending event is flushed by dispatch().
  if (buffer !== '') handleLine(buffer)
  const tail = dispatch()
  if (tail !== undefined) yield tail
}
