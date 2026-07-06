// Purpose: the single LLMProvider contract + shared result/error types for the
// provider layer (rule 65). UI/feature code depends on these types, never on a
// vendor SDK. Vendor adapters map their raw responses into these shapes.
//
// This module is type-only except for ProviderException (the typed throwable);
// it is excluded from the coverage gate (vite.config.ts). Its one runtime path
// (constructor detail sanitization) is exercised via errors.test / redact.test.

import { sanitizeDetail } from './redact'

export type Vendor = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'custom'
export type PolishGoal = 'clarity' | 'tone' | 'grammar' | 'concise'
export const POLISH_GOALS: readonly PolishGoal[] = ['clarity', 'tone', 'grammar', 'concise']

export interface TranslateRequest {
  kind: 'translate'
  text: string
  targetLang: string
  sourceLang?: string
}
export interface PolishRequest {
  kind: 'polish'
  /** The DRAFT to polish. */
  text: string
  goal: PolishGoal
  lang?: string
  /**
   * Source-meaning reference (the original sentence). Sent to the model — as data,
   * never as instructions — so it can preserve the draft's intended meaning (feature #2).
   */
  original?: string
  /** Domain anchor terms; sent to the model as data, never as instructions (feature #2). */
  keywords?: readonly string[]
}
/**
 * Dictionary word-lookup request (feature #20): define one `word` in its `sentence`
 * context. Has NO `text` field — its validation/prompt branch must run BEFORE any shared
 * `req.text` access (rule: validateRequest restructure). The model returns one JSON object
 * (word, ipa, partOfSpeech, translations, meaning, senses); `sentence` is injected as data.
 */
export interface DefineRequest {
  kind: 'define'
  /** The clicked token to define. */
  word: string
  /** The full sentence the word was clicked in (context; sent as data, never instructions). */
  sentence: string
  /** Source language of the word/sentence (optional, threaded from the host pane). */
  sourceLang?: string
  /** Target language for the translation/meaning (must resolve via the curated registry). */
  targetLang: string
}
export type LLMRequest = TranslateRequest | PolishRequest | DefineRequest

export interface StreamChunk {
  text: string
}
export interface StreamOptions {
  signal?: AbortSignal
  timeoutMs?: number
  maxOutputTokens?: number
  model?: string
}
export interface ProviderConfig {
  apiKey?: string
  model?: string
  baseUrl?: string
  fetch?: typeof fetch
  /**
   * #28 same-origin LLM proxy. When set (only for a `custom` provider that is token-free single-origin
   * AND allow-listed — decided at the call site via `shouldProxy`), the OpenAI-compatible adapter POSTs
   * to `${origin}/proxy` with the upstream base URL in `x-lucid-proxy-upstream` instead of fetching
   * `baseUrl` directly; the server appends `/chat/completions` and relays. Absent → the direct path.
   */
  proxy?: { origin: string; upstream: string }
}

export type ErrorKind =
  | 'rateLimited'
  | 'providerDown'
  | 'unreachable'
  | 'invalidKey'
  | 'requestFailed'
  | 'timeout'
  | 'aborted'
  | 'refusal'
  | 'incomplete'
  | 'validation'
  | 'unknown'

export interface ProviderError {
  kind: ErrorKind
  /** Flat dot i18n key per rule 66 §5, e.g. 'error.rateLimited'. */
  messageKey: string
  /** Same-model transient retry eligibility. */
  retryable: boolean
  /** Cross-model degradation eligibility (model-unavailable / zero-output refusal). */
  fallbackable?: boolean
  /** Bounded ms parsed from Retry-After (seconds or HTTP-date). */
  retryAfterMs?: number
  /** Dev-only diagnostic; NEVER secrets. */
  detail?: string
}

/**
 * Typed throwable: `stream()` throws this (a real Error subclass), never a bare
 * ProviderError object. `collectStream` catches it and reads `.providerError`.
 */
export class ProviderException extends Error {
  readonly providerError: ProviderError
  constructor(providerError: ProviderError) {
    super(providerError.kind)
    this.name = 'ProviderException'
    // Sanitize at the source so NO ProviderException — however constructed —
    // can carry a raw credential in detail (rule 65 §5).
    this.providerError =
      providerError.detail === undefined
        ? providerError
        : { ...providerError, detail: sanitizeDetail(providerError.detail) }
  }
}

/** Terminal result of a collect-to-completion call (translate/polish). */
export type ProviderOutcome =
  | { status: 'done'; text: string }
  | { status: 'cancelled'; text: string }
  | { status: 'error'; text: string; error: ProviderError }

/** UI/store lifecycle. Defined here; owned and driven by the operation store (feature #2). */
export type OperationState =
  | { status: 'idle' }
  | { status: 'streaming'; text: string }
  | ProviderOutcome

export interface LLMProvider {
  readonly vendor: Vendor
  readonly model: string
  /** Canonical, single-attempt raw stream. Throws ProviderException on failure. */
  stream(request: LLMRequest, options?: StreamOptions): AsyncIterable<StreamChunk>
  /**
   * Resilient, normalized streaming (feature #2): yields StreamChunks and RETURNS a
   * terminal ProviderOutcome (mapped + sanitized error, retained partial text) — the
   * caller maps nothing. Validates the request, applies a default timeout, and does
   * pre-first-byte retry/fallback; never replays after a chunk is yielded (rule 65 §3/§4).
   * Consume via manual `.next()` — `for await` discards the generator's return value.
   */
  streamOp(request: LLMRequest, options?: StreamOptions): AsyncGenerator<StreamChunk, ProviderOutcome, void>
  /** Collect-to-completion + retry-if-no-bytes. */
  translate(request: TranslateRequest, options?: StreamOptions): Promise<ProviderOutcome>
  polish(request: PolishRequest, options?: StreamOptions): Promise<ProviderOutcome>
}
