// Purpose: versioned, tested prompt builders + request validation (rule 65 §7,
// rule 66 §1). Prompts are not inlined in components; they live here and assert
// the structure-preservation contract. buildPrompt returns {system, user} — the
// user content is the source text passed through verbatim (never mangled by us;
// preserving it is the model's instruction). validateRequest guards the inputs.

import type { LLMRequest, PolishGoal, PolishRequest, ProviderError, TranslateRequest } from '@/providers/types'
import { POLISH_GOALS } from '@/providers/types'
import { makeProviderError } from '@/providers/errors'

export const MAX_INPUT_CHARS = 100_000

/** Bumped when the prompt templates change (rule 65 §7 — prompts are versioned). */
export const PROMPT_VERSION = '2026-06-14.1'

// Language labels/codes are interpolated into the system instruction, so they are
// an injection surface (rule 65 §7). Restrict to letters/marks/digits + a few
// label punctuation chars, no line breaks or sentence punctuation, capped length —
// enough for "zh-Hans", "Chinese (Simplified)", "Norwegian Bokmål", "es-419",
// while making instruction injection impractical.
const LANG_PATTERN = /^[\p{L}\p{M}\p{N} \-()]{1,40}$/u

function invalidLang(value: string): boolean {
  return value.trim() === '' || !LANG_PATTERN.test(value)
}

export interface PromptResult {
  system: string
  user: string
}

// rule 66 §1 — structure preservation, applied to both flows.
const STRUCTURE_INSTRUCTION =
  'Preserve the source formatting exactly: Markdown syntax, line breaks, ordered/unordered lists, ' +
  'fenced and inline code, URLs, and placeholders (e.g. {name}, %s, {{count}}). Treat code blocks, ' +
  'inline code, URLs, and placeholder tokens as opaque — never translate, rewrite, reflow, or reorder ' +
  'them, and do not change their count or order. Return only the transformed text, with no commentary.'

const POLISH_GOAL_INSTRUCTION: Record<PolishGoal, string> = {
  clarity: 'Improve clarity and readability without changing the meaning.',
  tone: 'Refine the tone to be polished and professional without changing the meaning.',
  grammar: 'Correct grammar, spelling, and punctuation only — do not otherwise rewrite.',
  concise: 'Make the text more concise without losing any information.',
}

export function buildTranslatePrompt(req: TranslateRequest): PromptResult {
  const from = req.sourceLang ? `from ${req.sourceLang} ` : ''
  return {
    system: `You are a professional translator. Translate the user's text ${from}into ${req.targetLang}. ${STRUCTURE_INSTRUCTION}`,
    user: req.text,
  }
}

export function buildPolishPrompt(req: PolishRequest): PromptResult {
  const lang = req.lang ? ` The text is written in ${req.lang}.` : ''
  return {
    system: `You are a professional writing editor. ${POLISH_GOAL_INSTRUCTION[req.goal]}${lang} ${STRUCTURE_INSTRUCTION}`,
    user: req.text,
  }
}

export function buildPrompt(req: LLMRequest): PromptResult {
  return req.kind === 'translate' ? buildTranslatePrompt(req) : buildPolishPrompt(req)
}

/** Returns a `validation` ProviderError for a bad request, or undefined if valid. */
export function validateRequest(req: LLMRequest): ProviderError | undefined {
  // Guard the discriminant first — an untrusted runtime value could be neither.
  const kind: string = req.kind
  if (kind !== 'translate' && kind !== 'polish') {
    return makeProviderError('validation', { detail: 'unknown request kind' })
  }
  if (req.text.trim() === '') return makeProviderError('validation', { detail: 'empty input' })
  if (req.text.length > MAX_INPUT_CHARS) {
    return makeProviderError('validation', { detail: `input exceeds ${MAX_INPUT_CHARS} chars` })
  }
  if (req.kind === 'translate') {
    if (invalidLang(req.targetLang)) return makeProviderError('validation', { detail: 'invalid target language' })
    if (req.sourceLang !== undefined && invalidLang(req.sourceLang)) {
      return makeProviderError('validation', { detail: 'invalid source language' })
    }
  } else {
    if (!POLISH_GOALS.includes(req.goal)) return makeProviderError('validation', { detail: 'unknown polish goal' })
    if (req.lang !== undefined && invalidLang(req.lang)) {
      return makeProviderError('validation', { detail: 'invalid language' })
    }
  }
  return undefined
}
