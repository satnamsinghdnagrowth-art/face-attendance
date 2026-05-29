import { useEffect, useRef, useCallback, useState } from 'react';

interface UseReVerifyTimerOptions {
  intervalMins: number;       // 0 = disabled
  sessionActive: boolean;     // only tick when session is active
  onTimerFired: (minutesSinceStart: number) => void;
}

interface ReVerifyTimerState {
  nextReVerifyIn: number;     // seconds until next re-verify prompt
  verifyCount: number;        // how many re-verify rounds have fired
  isActive: boolean;
}

const INACTIVE_STATE: ReVerifyTimerState = {
  nextReVerifyIn: 0,
  verifyCount: 0,
  isActive: false,
};

export function useReVerifyTimer(options: UseReVerifyTimerOptions): ReVerifyTimerState {
  const { intervalMins, sessionActive, onTimerFired } = options;

  const [state, setState] = useState<ReVerifyTimerState>(() => {
    if (intervalMins <= 0 || !sessionActive) return INACTIVE_STATE;
    return { nextReVerifyIn: intervalMins * 60, verifyCount: 0, isActive: true };
  });

  // Keep latest callback ref so interval closure is never stale
  const onTimerFiredRef = useRef(onTimerFired);
  onTimerFiredRef.current = onTimerFired;

  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Disabled or session not active — clear everything and return inactive
    if (intervalMins <= 0 || !sessionActive) {
      clearTick();
      setState(INACTIVE_STATE);
      return;
    }

    const intervalSecs = intervalMins * 60;

    // Initialise / re-initialise countdown when session becomes active
    setState({ nextReVerifyIn: intervalSecs, verifyCount: 0, isActive: true });

    tickIntervalRef.current = setInterval(() => {
      setState((prev) => {
        const next = prev.nextReVerifyIn - 1;

        if (next <= 0) {
          // Fire the callback with the upcoming round number (prev.verifyCount + 1)
          const nextCount = prev.verifyCount + 1;
          // Use setTimeout so we don't call a state-setter side-effect inside setState
          setTimeout(() => onTimerFiredRef.current(nextCount), 0);
          return { nextReVerifyIn: intervalSecs, verifyCount: nextCount, isActive: true };
        }

        return { ...prev, nextReVerifyIn: next };
      });
    }, 1000);

    return () => { clearTick(); };
  }, [intervalMins, sessionActive, clearTick]);

  return state;
}
