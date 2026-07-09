/**
 * Shared resting-height sizing for the three auto-expanding editors (feature #13): translate Source,
 * polish Original, polish Draft. Truly shared by both translate and polish, so it lives in the neutral
 * `src/lib/editor` home (not a feature folder) to avoid a cross-feature import (AGENTS.md).
 *
 * Design: `dev-docs/designs/lucid-editor-resting-height/` (feature #26, issue #219). The committed
 * design lowers the resting minimum while KEEPING #13's grow-to-content model and the ~88vh cap.
 *
 * One shared constant per value — the design's explicit architectural instruction: DO NOT fork the
 * 56px / 98px value per editor. Keep each literal a COMPLETE Tailwind class string (never build
 * `min-h-[${n}px]` dynamically) — Tailwind v4's content scan reads these `.ts` literals as plain text
 * and only emits a rule for a whole, unbroken class token.
 */

/** Textarea resting minimum: one 18px×1.7 line (≈31px) + top/bottom padding. Empty & 1-line rest identical. */
export const EDITOR_FIELD_MIN_H = 'min-h-[56px]'

/** Polish card minimum: header (≈42px) + the 56px field. Applies to the two polish cards (Original, Draft). */
export const EDITOR_CARD_MIN_H = 'min-h-[98px]'
