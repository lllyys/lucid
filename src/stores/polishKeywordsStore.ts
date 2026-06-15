// Purpose: the Polish panel's domain keywords, hoisted from PolishPanel's local state to a store
// (feature #3, WI-6) so the sidebar Glossary's "use" can inject a term without prop-drilling or
// coupling GlossaryView to PolishPanel. Working state — NOT persisted (unlike the saved glossary).
// Components read via selectors (AGENTS.md) — never destructure the store.

import { create } from 'zustand'

interface PolishKeywordsState {
  keywords: string[]
  addKeyword: (keyword: string) => void
  removeKeyword: (keyword: string) => void
  reset: () => void
}

export const usePolishKeywordsStore = create<PolishKeywordsState>((set, get) => ({
  keywords: [],
  addKeyword: (keyword) => {
    const trimmed = keyword.trim()
    if (trimmed === '' || get().keywords.includes(trimmed)) return
    set({ keywords: [...get().keywords, trimmed] })
  },
  removeKeyword: (keyword) => set({ keywords: get().keywords.filter((k) => k !== keyword) }),
  reset: () => set({ keywords: [] }),
}))
