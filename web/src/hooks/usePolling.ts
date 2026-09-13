'use client';

import { useEffect, useRef } from 'react';

/**
 * Call `tick` every `intervalMs` while the tab is visible.
 *
 * Why polling and not a socket (A46): the only thing that needs to reach the browser
 * unprompted is "a LINE message arrived", which is one-way. Sending already goes over
 * REST because it is an approval, not a keystroke. A WebSocket would also not survive
 * the Next.js rewrite proxy that keeps the session cookie first-party, and would need a
 * shared pub/sub the moment the API runs on more than one instance.
 *
 * Three rules keep this cheap and correct:
 *
 *   - Paused while the tab is hidden. A salesperson with twenty lead tabs open is
 *     looking at one of them; the other nineteen should cost nothing.
 *   - Fires immediately on becoming visible again, so coming back to a tab never shows
 *     data up to one interval stale.
 *   - Never overlaps itself. If a request takes longer than the interval — a slow
 *     database, a phone on a bad connection — the next tick is skipped instead of
 *     stacking requests on a server that is already struggling.
 *
 * `enabled: false` pauses it, for instance while the user's own action is in flight.
 */
export function usePolling(
  tick: () => Promise<unknown>,
  intervalMs: number,
  enabled = true,
) {
  // Held in a ref so a new callback identity does not tear down and restart the timer.
  const tickRef = useRef(tick);
  tickRef.current = tick;

  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;

    const run = async () => {
      if (inFlight.current || document.visibilityState !== 'visible') return;
      inFlight.current = true;
      try {
        await tickRef.current();
      } catch {
        // The callback decides what a failure means; a poll that throws must not stop
        // the next one from being scheduled.
      } finally {
        inFlight.current = false;
      }
    };

    const timer = setInterval(run, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);
}
