export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  maxEntries: number;
}

export function createHistoryState<T>(initialPresent: T, maxEntries = 80): HistoryState<T> {
  return {
    past: [],
    present: structuredClone(initialPresent),
    future: [],
    maxEntries,
  };
}

export function pushHistory<T>(state: HistoryState<T>, nextPresent: T): HistoryState<T> {
  const nextPast = [...state.past, structuredClone(state.present)];
  if (nextPast.length > state.maxEntries) {
    nextPast.shift();
  }
  return {
    ...state,
    past: nextPast,
    present: structuredClone(nextPresent),
    future: [],
  };
}

export function undoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  const nextPast = state.past.slice(0, -1);
  return {
    ...state,
    past: nextPast,
    present: structuredClone(previous),
    future: [structuredClone(state.present), ...state.future],
  };
}

export function redoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  const nextFuture = state.future.slice(1);
  return {
    ...state,
    past: [...state.past, structuredClone(state.present)],
    present: structuredClone(next),
    future: nextFuture,
  };
}

export function canUndo<T>(state: HistoryState<T>): boolean {
  return state.past.length > 0;
}

export function canRedo<T>(state: HistoryState<T>): boolean {
  return state.future.length > 0;
}
