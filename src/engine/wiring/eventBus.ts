export type EventHandler<T = unknown> = (payload: T) => void;

/**
 * Bus desacoplado de eventos y señales entre comportamientos, arquetipos y escenas.
 */
export class EventBus {
  private listeners = new Map<string, Set<EventHandler<unknown>>>();

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped = handler as EventHandler<unknown>;
    set.add(wrapped);
    return () => this.off(event, handler);
  }

  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler as EventHandler<unknown>);
    if (set.size === 0) this.listeners.delete(event);
  }

  emit<T = unknown>(event: string, payload?: T): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[Nexus EventBus] Error en "${event}":`, err);
      }
    }
  }

  listenerCount(event?: string): number {
    if (event) return this.listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Pizarra compartida (Blackboard) para compartir estado vivo entre comportamientos.
 */
export class EngineBlackboard {
  private store = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  get<T = unknown>(key: string, fallback?: T): T {
    if (!this.store.has(key)) return fallback as T;
    return this.store.get(key) as T;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.store.entries());
  }

  clear(): void {
    this.store.clear();
  }
}
