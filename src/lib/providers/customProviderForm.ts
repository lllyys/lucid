// Purpose: pure validation for the Settings custom-provider add/edit form (#10 WI-3, design Section B).
// A custom endpoint needs a parseable http(s) base URL (the design rejects a scheme-less URL), a
// non-empty model, and a label that is unique (case-insensitive, trimmed) across the other customs.
// Label-uniqueness is the store's `uniqueLabel` predicate, injected so the form and the store share
// one source of truth (the predicate already trims + lower-cases). No secret is touched here (§5).

/** True iff `raw` parses as an http(s) URL WITH a host — a scheme-less or hostile-scheme URL is rejected. */
export function isValidBaseUrl(raw: string): boolean {
  const s = raw.trim()
  if (s === '') return false
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return url.hostname !== ''
}

/** The editable fields of the add/edit form. */
export interface CustomFormFields {
  label: string
  baseUrl: string
  model: string
}

/**
 * The form is submittable iff the label is unique-nonempty (per the injected predicate — the store's
 * `uniqueLabel`, which itself rejects an empty/whitespace label), the base URL parses, and the model
 * is non-empty. Drives "Add / Save disabled until valid" (design Section B).
 */
export function customFormValid(
  fields: CustomFormFields,
  labelIsUnique: (label: string) => boolean,
): boolean {
  return labelIsUnique(fields.label) && isValidBaseUrl(fields.baseUrl) && fields.model.trim() !== ''
}

/** The connection-test status that drives a custom's rail dot/status line (#10 — mirrors TestResult). */
type RailTestStatus = 'idle' | 'testing' | 'ok' | 'fail'

/**
 * The i18n key for a custom provider's compressed rail status line (design Section A populated rows).
 * `ok`/`testing`/`fail` map to the connection states; an UNtested custom shows "untested" once it has a
 * key, but "needs key" when its key is empty — which is also the post-reload state, since the key is
 * never persisted (rule 65 §5). NOTE a keyless-by-design endpoint also reads "needs key" until tested;
 * a successful keyless test then flips it to "connected". The dot color is derived in the component
 * from the same status via the WI-2 presentation tokens.
 */
export function customRailStatusKey(testResult: { status: RailTestStatus }, key: string): string {
  switch (testResult.status) {
    case 'ok':
      return 'settings.connOk'
    case 'testing':
      return 'settings.testing'
    case 'fail':
      return 'settings.needsKey'
    default:
      return key.trim() === '' ? 'settings.needsKey' : 'settings.statusUntested'
  }
}
