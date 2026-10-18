import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Custom React hook for requestAnimationFrame-synchronized chart rendering.
 * Ensures chart SVG and DOM updates are batched and aligned with the browser's
 * VSync display refresh cycle, preventing micro-stutters and main thread jank.
 */
export function useRafRender<T>(initialValue: T, enabled: boolean = true) {
  const [renderedState, setRenderedState] = useState<T>(initialValue);
  const pendingValueRef = useRef<T>(initialValue);
  const rafIdRef = useRef<number | null>(null);
  const isEnabledRef = useRef<boolean>(enabled);
  isEnabledRef.current = enabled;

  const updateState = useCallback((newValue: T | ((prev: T) => T)) => {
    if (!isEnabledRef.current) {
      // Direct synchronous update if rAF offload is disabled
      setRenderedState(newValue);
      return;
    }

    // Resolve functional update if needed
    if (typeof newValue === 'function') {
      pendingValueRef.current = (newValue as (prev: T) => T)(pendingValueRef.current);
    } else {
      pendingValueRef.current = newValue;
    }

    // Schedule frame update only if not already scheduled for current VSync tick
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        setRenderedState(pendingValueRef.current);
        rafIdRef.current = null;
      });
    }
  }, []);

  // Cleanup pending rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  return [renderedState, updateState] as const;
}
