import { Toaster } from '@/components/ui/sonner'

/**
 * Toast host (feature #2, WI-8) — wraps the generated Sonner Toaster and styles it (in this
 * wrapper, not the generated primitive — rule 32) to the design's bespoke dark confirmation
 * pill. `notify()` is the single entry point for accept/copy confirmations.
 */
export function WorkspaceToast() {
  return (
    <Toaster
      position="bottom-center"
      toastOptions={{
        style: {
          background: 'var(--text-color)',
          color: 'var(--bg-color)',
          border: 'none',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-toast)',
          fontFamily: 'var(--font-sans)',
          fontSize: '13.5px',
          fontWeight: 500,
        },
      }}
    />
  )
}
