export interface PersistedWorldNodeState {
  harvestedAt: number;
  respawnAt: number;
  harvestedBy: string;
}

export interface PersistedPlayerState {
  inventory: Record<string, number>;
  currencies: Record<string, number>;
  equipped: Record<string, string>;
  quests: Record<string, { status: 'active' | 'completed'; progress: number }>;
  stats: Record<string, number>;
  worldNodes: Record<string, PersistedWorldNodeState>;
  currentZone: string;
  updatedAt: number;
}

export interface SaveMutationResult {
  accepted: boolean;
  reason?: 'duplicate_action' | 'cooldown_active' | 'invalid_amount' | 'insufficient_items';
  newAmount?: number;
}

const MAX_PROCESSED_ACTIONS = 2000;

function createEmptyState(): PersistedPlayerState {
  return {
    inventory: {},
    currencies: { gold: 0, gems: 0 },
    equipped: {},
    quests: {},
    stats: { level: 1, xp: 0 },
    worldNodes: {},
    currentZone: 'default',
    updatedAt: Date.now(),
  };
}

/**
 * Almacén de persistencia híbrido (LocalStorage + Sincronización con Servidor / Portal)
 * con protección anti-duplicado por ID de transacción y enfriamiento de nodos de recursos.
 */
export class PersistenceStore {
  readonly storageKey: string;
  state: PersistedPlayerState;
  private processedActionIds: string[] = [];
  private processedActionSet = new Set<string>();

  constructor(storageKey = 'nexus_player_save_v1') {
    this.storageKey = storageKey;
    this.state = createEmptyState();
  }

  private rememberAction(actionId?: string): boolean {
    if (!actionId) return true;
    if (this.processedActionSet.has(actionId)) return false;
    this.processedActionSet.add(actionId);
    this.processedActionIds.push(actionId);
    if (this.processedActionIds.length > MAX_PROCESSED_ACTIONS) {
      const oldest = this.processedActionIds.shift();
      if (oldest) this.processedActionSet.delete(oldest);
    }
    return true;
  }

  addItem(itemId: string, amount = 1, actionId?: string): SaveMutationResult {
    const cleanId = itemId.trim();
    const qty = Math.floor(Number(amount));
    if (!cleanId || !Number.isFinite(qty) || qty <= 0) {
      return { accepted: false, reason: 'invalid_amount' };
    }
    if (!this.rememberAction(actionId)) {
      return { accepted: false, reason: 'duplicate_action' };
    }
    const next = (this.state.inventory[cleanId] ?? 0) + qty;
    this.state.inventory[cleanId] = next;
    this.state.updatedAt = Date.now();
    this.saveLocal();
    return { accepted: true, newAmount: next };
  }

  removeItem(itemId: string, amount = 1, actionId?: string): SaveMutationResult {
    const cleanId = itemId.trim();
    const qty = Math.floor(Number(amount));
    if (!cleanId || !Number.isFinite(qty) || qty <= 0) {
      return { accepted: false, reason: 'invalid_amount' };
    }
    const cur = this.state.inventory[cleanId] ?? 0;
    if (cur < qty) {
      return { accepted: false, reason: 'insufficient_items' };
    }
    if (!this.rememberAction(actionId)) {
      return { accepted: false, reason: 'duplicate_action' };
    }
    const next = cur - qty;
    if (next <= 0) delete this.state.inventory[cleanId];
    else this.state.inventory[cleanId] = next;
    this.state.updatedAt = Date.now();
    this.saveLocal();
    return { accepted: true, newAmount: next };
  }

  addCurrency(currencyId: string, delta: number, actionId?: string): SaveMutationResult {
    const clean = currencyId.trim();
    const amt = Math.round(Number(delta));
    if (!clean || !Number.isFinite(amt)) {
      return { accepted: false, reason: 'invalid_amount' };
    }
    if (!this.rememberAction(actionId)) {
      return { accepted: false, reason: 'duplicate_action' };
    }
    const next = Math.max(0, (this.state.currencies[clean] ?? 0) + amt);
    this.state.currencies[clean] = next;
    this.state.updatedAt = Date.now();
    this.saveLocal();
    return { accepted: true, newAmount: next };
  }

  claimWorldNode(
    nodeId: string,
    respawnSec = 30,
    playerId = 'local',
    actionId?: string,
    now = Date.now()
  ): SaveMutationResult {
    const existing = this.state.worldNodes[nodeId];
    if (existing && existing.respawnAt > now) {
      return { accepted: false, reason: 'cooldown_active' };
    }
    if (!this.rememberAction(actionId)) {
      return { accepted: false, reason: 'duplicate_action' };
    }
    this.state.worldNodes[nodeId] = {
      harvestedAt: now,
      respawnAt: now + Math.max(1, respawnSec) * 1000,
      harvestedBy: playerId,
    };
    this.state.updatedAt = now;
    this.saveLocal();
    return { accepted: true };
  }

  isWorldNodeAvailable(nodeId: string, now = Date.now()): boolean {
    const node = this.state.worldNodes[nodeId];
    return !node || node.respawnAt <= now;
  }

  saveLocal(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.state));
      return true;
    } catch {
      return false;
    }
  }

  loadLocal(): PersistedPlayerState {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return this.state;
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return this.state;
      const parsed = JSON.parse(raw) as Partial<PersistedPlayerState>;
      if (parsed && typeof parsed === 'object') {
        this.state = {
          ...createEmptyState(),
          ...parsed,
          inventory: parsed.inventory ?? {},
          currencies: parsed.currencies ?? { gold: 0, gems: 0 },
          equipped: parsed.equipped ?? {},
          quests: parsed.quests ?? {},
          stats: parsed.stats ?? { level: 1, xp: 0 },
          worldNodes: parsed.worldNodes ?? {},
        };
      }
    } catch {
      // Fallback limpio si hay JSON corrupto
    }
    return this.state;
  }

  async syncToServer(playerId: string, baseUrl = ''): Promise<boolean> {
    const safeId = playerId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    if (!safeId || typeof fetch === 'undefined') return false;
    try {
      const res = await fetch(`${baseUrl}/api/save/${encodeURIComponent(safeId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async loadFromServer(playerId: string, baseUrl = ''): Promise<boolean> {
    const safeId = playerId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    if (!safeId || typeof fetch === 'undefined') return false;
    try {
      const res = await fetch(`${baseUrl}/api/save/${encodeURIComponent(safeId)}`);
      if (!res.ok) return false;
      const data = (await res.json()) as { ok?: boolean; state?: PersistedPlayerState };
      if (data?.ok && data.state) {
        if ((data.state.updatedAt ?? 0) >= this.state.updatedAt) {
          this.state = { ...createEmptyState(), ...data.state };
          this.saveLocal();
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
