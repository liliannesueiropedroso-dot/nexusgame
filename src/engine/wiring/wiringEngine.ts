import type { ArchetypeId, SceneContextType, WiringLink } from '../core/types';
import { getArchetypeRecipe } from './archetypes';
import { EngineBlackboard, EventBus } from './eventBus';
import { PersistenceStore } from './persistenceStore';
import { PortalBridge } from './portalBridge';

export interface WiredBehaviorLifecycle {
  id: string;
  name?: string;
  contexts?: SceneContextType[];
  inputs?: string[];
  outputs?: string[];
  defaultParams?: Record<string, unknown>;
  onInit?: (entity: WiredEntity, instance: WiredBehaviorInstance, sys: EngineWiringSystem) => void;
  onStart?: (entity: WiredEntity, instance: WiredBehaviorInstance, sys: EngineWiringSystem) => void;
  onUpdate?: (
    entity: WiredEntity,
    instance: WiredBehaviorInstance,
    sys: EngineWiringSystem,
    dt: number
  ) => void;
  onEvent?: (
    entity: WiredEntity,
    instance: WiredBehaviorInstance,
    sys: EngineWiringSystem,
    action: string,
    payload: Record<string, unknown>
  ) => void;
  onDestroy?: (entity: WiredEntity, instance: WiredBehaviorInstance, sys: EngineWiringSystem) => void;
}

export interface WiredBehaviorInstance {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  params: Record<string, unknown>;
  state: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
  contexts: SceneContextType[];
  _def?: WiredBehaviorLifecycle;
}

export interface WiredEntity {
  id: string;
  name: string;
  role: string;
  transform: { x: number; y: number; z: number; rotY: number };
  net: { replicated: boolean; ownerId: string | null };
  behaviors: WiredBehaviorInstance[];
  started: boolean;
}

/**
 * Núcleo modular en tiempo de ejecución que administra entidades, ciclo de vida de
 * comportamientos, contextos de escena, auto-cableado de arquetipos y despacho de señales.
 */
export class EngineWiringSystem {
  readonly bus: EventBus;
  readonly blackboard: EngineBlackboard;
  readonly persistence: PersistenceStore;
  readonly portalBridge: PortalBridge;
  readonly defs = new Map<string, WiredBehaviorLifecycle>();
  readonly entities = new Map<string, WiredEntity>();
  wiringLinks: WiringLink[] = [];
  sceneContext: SceneContextType = 'gameplay';

  constructor(
    persistence = new PersistenceStore(),
    portalBridge = new PortalBridge('auto')
  ) {
    this.bus = new EventBus();
    this.blackboard = new EngineBlackboard();
    this.persistence = persistence;
    this.portalBridge = portalBridge;
    this.portalBridge.bus = this.bus;
    this.registerBuiltinRuntimeBehaviors();
  }

  private registerBuiltinRuntimeBehaviors(): void {
    this.registerBehavior({
      id: 'inventory.backpack',
      name: 'Inventario de Mochila',
      contexts: ['gameplay', 'open_world', 'inventory'],
      inputs: ['receiveItem', 'receiveBatch', 'receiveDrop', 'consumeItem'],
      outputs: ['onInventoryChanged'],
      onEvent: (entity, _inst, sys, action, payload) => {
        if ((action === 'receiveItem' || action === 'receiveDrop') && typeof payload.itemId === 'string') {
          const res = sys.persistence.addItem(
            payload.itemId,
            Number(payload.amount ?? 1),
            typeof payload.actionId === 'string' ? payload.actionId : undefined
          );
          if (res.accepted) {
            sys.bus.emit('inventory:changed', {
              entityId: entity.id,
              inventory: { ...sys.persistence.state.inventory },
            });
          }
        } else if (action === 'receiveBatch' && Array.isArray(payload.items)) {
          let changed = false;
          for (const rawIt of payload.items) {
            const it = rawIt as { itemId?: string; amount?: number; actionId?: string };
            if (!it?.itemId) continue;
            const res = sys.persistence.addItem(it.itemId, Number(it.amount ?? 1), it.actionId);
            if (res.accepted) changed = true;
          }
          if (changed) {
            sys.bus.emit('inventory:changed', {
              entityId: entity.id,
              inventory: { ...sys.persistence.state.inventory },
            });
          }
        }
      },
    });

    this.registerBehavior({
      id: 'persistence.player_save',
      name: 'Persistencia de Jugador',
      contexts: ['gameplay', 'open_world', 'inventory', 'menu'],
      inputs: ['saveNow', 'loadNow'],
      outputs: ['onSaved', 'onLoaded'],
      onEvent: (entity, _inst, sys, action) => {
        if (action === 'saveNow') {
          sys.persistence.saveLocal();
          sys.bus.emit('persistence:saved', { entityId: entity.id, state: sys.persistence.state });
        } else if (action === 'loadNow') {
          sys.persistence.loadLocal();
          sys.bus.emit('persistence:loaded', { entityId: entity.id, state: sys.persistence.state });
        }
      },
    });

    this.registerBehavior({
      id: 'juice.camera_follow',
      name: 'Seguir con Cámara',
      contexts: ['gameplay', 'open_world'],
      inputs: ['setTarget'],
      outputs: [],
      onEvent: (_entity, inst, sys, action, payload) => {
        if (action === 'setTarget') {
          const targetId = typeof payload.targetId === 'string' ? payload.targetId : null;
          inst.state.targetId = targetId;
          sys.blackboard.set('cameraFollowTargetId', targetId);
          sys.bus.emit('camera:targetChanged', { targetId });
        }
      },
    });
  }

  registerBehavior(def: WiredBehaviorLifecycle): void {
    this.defs.set(def.id, def);
  }

  setSceneContext(context: SceneContextType): void {
    this.sceneContext = context;
    this.bus.emit('scene:contextChanged', { context });
  }

  createEntity(opts: {
    id: string;
    name?: string;
    role?: string;
    transform?: { x: number; y: number; z: number; rotY: number };
    net?: { replicated: boolean; ownerId: string | null };
  }): WiredEntity {
    const entity: WiredEntity = {
      id: opts.id,
      name: opts.name ?? opts.id,
      role: opts.role ?? 'generic',
      transform: opts.transform ?? { x: 0, y: 0, z: 0, rotY: 0 },
      net: opts.net ?? { replicated: false, ownerId: null },
      behaviors: [],
      started: false,
    };
    this.entities.set(entity.id, entity);
    this.bus.emit('entity:created', { entity });
    return entity;
  }

  destroyEntity(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;
    for (const b of entity.behaviors) {
      b._def?.onDestroy?.(entity, b, this);
    }
    this.entities.delete(entityId);
    this.wiringLinks = this.wiringLinks.filter(
      (l) => l.sourceObjectId !== entityId && l.targetObjectId !== entityId
    );
    this.bus.emit('entity:destroyed', { entityId });
  }

  addBehavior(
    entityId: string,
    behaviorId: string,
    params: Record<string, unknown> = {},
    source = 'manual'
  ): WiredBehaviorInstance | null {
    const entity = this.entities.get(entityId);
    if (!entity) return null;
    const def = this.defs.get(behaviorId);

    const existing = entity.behaviors.find((b) => b.id === behaviorId);
    if (existing) {
      existing.params = { ...existing.params, ...params };
      this.bus.emit('behavior:updated', { entity, behavior: existing });
      return existing;
    }

    const instance: WiredBehaviorInstance = {
      id: behaviorId,
      name: def?.name ?? behaviorId,
      source,
      enabled: true,
      params: { ...(def?.defaultParams ?? {}), ...params },
      state: {},
      inputs: def?.inputs ?? [],
      outputs: def?.outputs ?? [],
      contexts: def?.contexts ?? ['gameplay'],
      _def: def,
    };
    entity.behaviors.push(instance);
    def?.onInit?.(entity, instance, this);
    if (entity.started) {
      def?.onStart?.(entity, instance, this);
    }
    this.bus.emit('behavior:added', { entity, behavior: instance });
    return instance;
  }

  applyArchetype(entityId: string, archetypeId: ArchetypeId): WiringLink[] {
    const entity = this.entities.get(entityId);
    const recipe = getArchetypeRecipe(archetypeId);
    if (!entity || !recipe) return [];
    entity.role = recipe.role;

    for (const bp of recipe.behaviors) {
      this.addBehavior(entityId, bp.type, bp.config ?? {}, `archetype:${recipe.id}`);
    }

    const created: WiringLink[] = [];
    for (const rule of recipe.autoWire) {
      const targets = Array.from(this.entities.values()).filter((e) => e.role === rule.toRole);
      for (const target of targets) {
        if (target.behaviors.some((tb) => tb.id === rule.toBehavior)) {
          const link = this.wire({
            sourceObjectId: entity.id,
            sourceBehavior: rule.fromBehavior,
            signal: rule.signal,
            targetObjectId: target.id,
            targetBehavior: rule.toBehavior,
            action: rule.action,
            auto: true,
          });
          if (link) created.push(link);
        }
      }
    }

    this.bus.emit('archetype:applied', { entity, archetypeId, created });
    return created;
  }

  wire(link: Omit<WiringLink, 'id'>): WiringLink | null {
    const exists = this.wiringLinks.some(
      (l) =>
        l.sourceObjectId === link.sourceObjectId &&
        l.sourceBehavior === link.sourceBehavior &&
        l.signal === link.signal &&
        l.targetObjectId === link.targetObjectId &&
        l.targetBehavior === link.targetBehavior &&
        l.action === link.action
    );
    if (exists) return null;
    const next: WiringLink = {
      ...link,
      id: `wire_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
    this.wiringLinks.push(next);
    this.bus.emit('wiring:changed', { links: this.wiringLinks });
    return next;
  }

  emitBehaviorSignal(
    sourceObjectId: string,
    sourceBehavior: string,
    signal: string,
    payload: Record<string, unknown> = {}
  ): number {
    this.bus.emit('behavior:signal', { sourceObjectId, sourceBehavior, signal, payload });
    let dispatched = 0;
    const links = this.wiringLinks.filter(
      (l) =>
        l.sourceObjectId === sourceObjectId &&
        l.sourceBehavior === sourceBehavior &&
        l.signal === signal
    );
    for (const link of links) {
      const tgtEntity = this.entities.get(link.targetObjectId);
      if (!tgtEntity) continue;
      const tgtBehavior = tgtEntity.behaviors.find(
        (b) => b.id === link.targetBehavior && b.enabled
      );
      if (tgtBehavior?._def?.onEvent) {
        tgtBehavior._def.onEvent(tgtEntity, tgtBehavior, this, link.action, payload);
        dispatched += 1;
      }
    }
    return dispatched;
  }

  getInspectorView(entityId: string) {
    const entity = this.entities.get(entityId);
    if (!entity) return null;
    return {
      entityId: entity.id,
      entityName: entity.name,
      role: entity.role,
      behaviors: entity.behaviors.map((b) => ({
        id: b.id,
        name: b.name,
        source: b.source,
        enabled: b.enabled,
        contexts: b.contexts,
        inputs: b.inputs,
        outputs: b.outputs,
        params: b.params,
        incomingLinks: this.wiringLinks.filter(
          (l) => l.targetObjectId === entity.id && l.targetBehavior === b.id
        ),
        outgoingLinks: this.wiringLinks.filter(
          (l) => l.sourceObjectId === entity.id && l.sourceBehavior === b.id
        ),
      })),
    };
  }

  startAll(): void {
    for (const entity of this.entities.values()) {
      if (entity.started) continue;
      entity.started = true;
      for (const b of entity.behaviors) {
        if (b.enabled) b._def?.onStart?.(entity, b, this);
      }
    }
  }

  update(dt: number): void {
    const clampedDt = Math.min(Math.max(dt || 0, 0), 0.05);
    for (const entity of this.entities.values()) {
      for (const b of entity.behaviors) {
        if (!b.enabled) continue;
        if (!b.contexts.includes(this.sceneContext)) continue;
        b._def?.onUpdate?.(entity, b, this, clampedDt);
      }
    }
  }
}
