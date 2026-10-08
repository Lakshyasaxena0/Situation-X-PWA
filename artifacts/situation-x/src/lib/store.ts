import { useSyncExternalStore } from "react";

/**
 * A tiny persistent store. State lives in memory (so it survives switching pages) and is mirrored
 * to browser storage (so it survives a reload). Storage can be blocked or full (private window),
 * so every access is guarded and the app keeps working without it.
 */
export function createStore<T>(key: string, initial: T, storage: "local" | "session", sanitize?: (raw: unknown) => T) {
  const area = (): Storage | null => {
    try {
      return storage === "local" ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };

  let state: T = initial;
  try {
    const raw = area()?.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      state = sanitize ? sanitize(parsed) : (parsed as T);
    }
  } catch {
    state = initial;
  }

  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
      try {
        area()?.setItem(key, JSON.stringify(state));
      } catch {
        /* storage full or blocked: keep it in memory only */
      }
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    use(): T {
      return useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => state,
        () => state,
      );
    },
  };
}
