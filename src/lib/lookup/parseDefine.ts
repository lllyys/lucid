// Purpose: partial-tolerant parse of the streamed define-JSON from the model (feature #20).
// The model is instructed to emit ONE object {word, ipa, partOfSpeech, translations, meaning,
// senses}; while streaming it arrives incrementally and may be wrapped in fences/prose. This
// extracts whatever is present so the popover can show word+IPA first and fill the rest as the
// stream grows, and reports `usable` so the hook can map a done-but-empty result to an error
// (rule 65). It keys ONLY on the model's emitted object — never on the echoed input sentence.

/** One distinct sense of the word. */
export interface DefineSense {
  gloss: string
  meaning: string
}

/** The accumulated, partial-tolerant parse of the define stream. */
export interface DefineResult {
  word?: string
  ipa?: string
  partOfSpeech?: string
  translations: string[]
  meaning?: string
  senses: DefineSense[]
  /** True once there is at least a word or a meaning — i.e. something worth showing. */
  usable: boolean
}

const EMPTY: DefineResult = { translations: [], senses: [], usable: false }

/** Strip a leading/trailing markdown code fence (```json … ```), if present. */
function stripFence(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return fence ? fence[1] : text
}

/**
 * Attempt to JSON.parse a (possibly truncated) object substring. Returns the parsed value or
 * undefined. For a truncated stream we "repair" by balancing the open braces/brackets and
 * closing a dangling string, then re-parse — a best-effort that recovers the completed prefix.
 */
function tryParseObject(src: string): Record<string, unknown> | undefined {
  const start = src.indexOf('{')
  if (start === -1) return undefined
  const body = src.slice(start)
  // Direct parse of the brace-matched object (drops any trailing prose after `}`); fall back to
  // the streaming repair for a truncated tail.
  const direct = safeParse(matchedObject(body) ?? body) ?? safeParse(repair(body))
  return direct && typeof direct === 'object' && !Array.isArray(direct)
    ? (direct as Record<string, unknown>)
    : undefined
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

/**
 * If `body` contains a fully-balanced top-level object, return exactly that object substring so
 * trailing prose (e.g. " — done.") after the closing brace is dropped. Returns undefined if the
 * object never closes (a truncated stream — handled by repair()).
 */
function matchedObject(body: string): string | undefined {
  let inStr = false
  let esc = false
  let depth = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return body.slice(0, i + 1)
  }
  return undefined
}

/**
 * Best-effort completion of a truncated JSON object: walk the string tracking string/escape and
 * the container stack, remembering the last position where the JSON-so-far is a COMPLETE value
 * (after a value string's closing quote, a closing `}`/`]`, or a finished number/keyword). Cut
 * any dangling partial token there, then append the open containers' closers.
 *
 * A safe cut point requires distinguishing a key string (in an object, before `:`) from a value
 * string. `inObject` (top of stack is `}`) + `afterColon` track whether the current position
 * expects a value: array items are always values; object members are values only after `:`.
 */
function repair(body: string): string {
  let inStr = false
  let esc = false
  let afterColon = false // in an object, true once a `:` has been seen for the current member
  const stack: string[] = []
  let safeEnd = 0
  const expectsValue = () => stack[stack.length - 1] === ']' || (stack[stack.length - 1] === '}' && afterColon)
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') {
        inStr = false
        if (expectsValue()) {
          safeEnd = i + 1 // a value string just closed — safe to cut here
          afterColon = false // the member's value is done; a following token is not its value
        }
      }
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']')
      afterColon = false
    } else if (ch === '}' || ch === ']') {
      stack.pop()
      safeEnd = i + 1
      afterColon = false
    } else if (ch === ':') afterColon = true
    else if (ch === ',') afterColon = false
    else if (ch !== ' ' && ch !== '\n' && ch !== '\t' && ch !== '\r') {
      // a literal value token (number / true / false / null) — its running end is a safe cut
      if (expectsValue()) safeEnd = i + 1
    }
  }
  let out = body.slice(0, safeEnd).replace(/[,\s]*$/, '')
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i]
  return out
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function asSenses(v: unknown): DefineSense[] {
  if (!Array.isArray(v)) return []
  const out: DefineSense[] = []
  for (const s of v) {
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      const gloss = asString((s as Record<string, unknown>).gloss)
      const meaning = asString((s as Record<string, unknown>).meaning)
      if (gloss !== undefined && meaning !== undefined) out.push({ gloss, meaning })
    }
  }
  return out
}

/**
 * Parse the accumulated define stream into a partial-tolerant result. Never throws. A result is
 * `usable` once it carries a non-empty word OR meaning; an empty/garbage/field-less object is not.
 */
export function parseDefine(text: string): DefineResult {
  if (text.trim() === '') return EMPTY
  const obj = tryParseObject(stripFence(text))
  if (obj === undefined) return EMPTY

  const word = asString(obj.word)
  const ipa = asString(obj.ipa)
  const partOfSpeech = asString(obj.partOfSpeech)
  const translations = asStringArray(obj.translations)
  const meaning = asString(obj.meaning)
  const senses = asSenses(obj.senses)

  const result: DefineResult = {
    translations,
    senses,
    usable: word !== undefined || meaning !== undefined,
  }
  if (word !== undefined) result.word = word
  if (ipa !== undefined) result.ipa = ipa
  if (partOfSpeech !== undefined) result.partOfSpeech = partOfSpeech
  if (meaning !== undefined) result.meaning = meaning
  return result
}
