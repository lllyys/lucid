import { useEffect, useState } from 'react'

/**
 * Render-only live elapsed timer (feature #2, WI-7). While `running` and `startedAt` is set,
 * it ticks the elapsed milliseconds for display. It writes NO store: the operationStore owns
 * `startedAt` and the frozen `elapsedMs`; this hook only drives the live readout during a
 * stream (the panel shows the frozen value once the run ends).
 */
export function useElapsedTimer(startedAt: number | null, running: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (startedAt === null || !running) return
    const update = () => setElapsed(Date.now() - startedAt)
    update()
    const id = setInterval(update, 100)
    return () => clearInterval(id)
  }, [startedAt, running])
  return elapsed
}
