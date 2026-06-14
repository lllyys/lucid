// Purpose: redact credential-like substrings from dev-only diagnostic strings
// (rule 65 §5) before they can enter a ProviderError.detail. Imported by BOTH
// the error mapper (errors.ts) and the typed throwable (types.ts) so that no
// construction path — makeProviderError, toProviderError, or a directly built
// ProviderException — can carry a raw key/token. Redaction is idempotent.

export function sanitizeDetail(detail: string): string {
  return (
    detail
      // sk- style API keys (Anthropic/OpenAI), case-insensitive.
      .replace(/sk-[a-z0-9_-]{6,}/gi, 'sk-[REDACTED]')
      // Bearer tokens, including the full base64url/base64 + padding charset.
      .replace(/\b(bearer)\s+[a-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
      // key: value / key=value / "key":"value" (JSON), case-insensitive.
      .replace(
        /("?\b(?:x-api-key|api[_-]?key|authorization|token|password|secret)\b"?\s*[:=]\s*)"?[^"\s,}]+"?/gi,
        '$1[REDACTED]',
      )
  )
}
