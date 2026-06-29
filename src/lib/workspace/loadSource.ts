// Purpose: a tiny window-event bridge (mirrors openSettings) so the Starred review surface
// (feature #24) can ask the workspace to load a starred item's source text into the translate
// editor without prop-drilling or coupling to TranslatePanel's internal state. Two decoupled
// consumers subscribe via onLoadSource: TranslatePanel routes the text through its source-edit
// handler (result reset + auto-run re-arm), and Workspace closes the sidebar drawer + switches to
// the translate pane. The CustomEvent<{text}> cast is encapsulated here (the 100%-gated lib) so
// neither consumer repeats it.

export const LOAD_SOURCE_EVENT = 'lucid:load-source'

/** Ask the workspace to load `text` into the translate editor. */
export function loadSourceIntoWorkspace(text: string): void {
  window.dispatchEvent(new CustomEvent<{ text: string }>(LOAD_SOURCE_EVENT, { detail: { text } }))
}

/** Subscribe to load-source requests; the handler receives the text. Returns an unsubscribe fn. */
export function onLoadSource(handler: (text: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<{ text: string }>).detail.text)
  window.addEventListener(LOAD_SOURCE_EVENT, listener)
  return () => window.removeEventListener(LOAD_SOURCE_EVENT, listener)
}
