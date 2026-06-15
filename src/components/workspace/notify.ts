import { toast } from 'sonner'

/**
 * Surface a transient confirmation (accept / copy) through the WorkspaceToast host.
 * Centralizes the sonner dependency so components don't import it directly. Kept in its own
 * module (not WorkspaceToast.tsx) so that file only exports a component (react-refresh).
 */
export function notify(message: string): void {
  toast(message)
}
