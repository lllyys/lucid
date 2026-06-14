// Purpose: the canonical class-name combiner for shadcn/ui + Tailwind v4 (rule 32).
// cn() merges conditional clsx input and de-conflicts Tailwind utilities via
// tailwind-merge (last conflicting utility wins). Used by every generated
// primitive and wrapper component.

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
