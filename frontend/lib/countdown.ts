'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Format a millisecond duration as mm:ss (or hh:mm:ss when >= 1 hour).
 * Never returns negative — clamps to 00:00.
 */
export function formatHMS(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export interface Countdown {
  remainingMs: number;
  label: string;       // mm:ss or hh:mm:ss
  /** True only once a valid target exists AND the time is up. A missing or
   *  not-yet-loaded target is NOT "expired" — treating it as such caused the
   *  exam page to auto-submit the moment it mounted, before `expires_at`
   *  had arrived from the server. */
  expired: boolean;
  warn: boolean;       // 0 < remaining < 5 min
  /** A usable target has been supplied. */
  ready: boolean;
}

/**
 * Live countdown to `targetIso` (an ISO-8601 string, e.g. a server `expires_at`).
 *
 * `serverNowIso` neutralizes client clock skew: we compute the offset between the
 * server's "now" and the browser clock once, then apply it on every tick. This is
 * critical for exam deadlines — the server is authoritative, and a student with a
 * wrong local clock must not gain or lose time.
 *
 * Ticks every second and stops at zero.
 */
export function useServerCountdown(
  targetIso: string | null | undefined,
  serverNowIso?: string | null,
): Countdown {
  const offsetRef = useRef(0);

  // (Re)compute the server↔client clock offset whenever either timestamp changes.
  useEffect(() => {
    if (serverNowIso) {
      const serverMs = new Date(serverNowIso).getTime();
      if (!Number.isNaN(serverMs)) offsetRef.current = serverMs - Date.now();
    }
  }, [serverNowIso, targetIso]);

  const compute = (): number => {
    if (!targetIso) return 0;
    const target = new Date(targetIso).getTime();
    if (Number.isNaN(target)) return 0;
    return target - (Date.now() + offsetRef.current);
  };

  const [remainingMs, setRemainingMs] = useState<number>(() => compute());
  // Which target we have actually measured. Until the effect below has run for
  // a target, `remainingMs` is meaningless (it starts at 0) — reporting
  // "expired" in that window made the exam page auto-submit on mount.
  const [armedFor, setArmedFor] = useState<string | null>(null);

  useEffect(() => {
    setRemainingMs(compute());
    setArmedFor(targetIso ?? null);
    if (!targetIso) return;
    const timer = setInterval(() => {
      const r = compute();
      setRemainingMs(r);
      if (r <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIso, serverNowIso]);

  const ready = !!targetIso
    && armedFor === targetIso
    && !Number.isNaN(new Date(targetIso).getTime());

  return {
    remainingMs,
    label: formatHMS(remainingMs),
    expired: ready && remainingMs <= 0,
    warn: remainingMs > 0 && remainingMs < 5 * 60 * 1000,
    ready,
  };
}
