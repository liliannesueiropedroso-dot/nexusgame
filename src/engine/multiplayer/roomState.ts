import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface NetPlayerState {
  playerId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  vx: number;
  vy: number;
  vz: number;
  animState: string;
  sceneId: string;
  mode: '2d' | '3d';
  updatedAt: number;
}

export interface RoomNodeCooldown {
  nodeId: string;
  claimedBy: string;
  claimedAt: number;
  respawnAt: number;
}

export interface RoomSnapshot {
  roomId: string;
  shardIndex: number;
  maxPlayers: number;
  players: NetPlayerState[];
  unavailableNodes: RoomNodeCooldown[];
}

export interface RoomActionResult {
  ok: boolean;
  reason?: string;
  duplicate?: boolean;
  respawnAt?: number;
}

const MAX_ROOMS = 64;
const MAX_PLAYERS_PER_ROOM = 32;
const MAX_ACTION_HISTORY = 2000;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,48}$/;

export function sanitizeNetId(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (SAFE_ID_REGEX.test(trimmed)) return trimmed;
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return cleaned.length > 0 ? cleaned : fallback;
}

function clampFinite(val: unknown, fallback = 0, min = -1e6, max = 1e6): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeLabel(raw: unknown, fallback: string, maxLen = 40): string {
  if (typeof raw !== 'string') return fallback;
  const s = raw.replace(/[\r\n\t<>]/g, ' ').trim().slice(0, maxLen);
  return s.length > 0 ? s : fallback;
}

interface InternalRoom {
  roomId: string;
  shardIndex: number;
  maxPlayers: number;
  players: Map<string, NetPlayerState>;
  nodeCooldowns: Map<string, RoomNodeCooldown>;
  processedActions: Set<string>;
  actionQueue: string[];
  createdAt: number;
}

/**
 * Gestor autoritativo de salas, sharding, sincronización de jugadores,
 * anti-duplicado de acciones/ítems y enfriamiento de nodos en mundo abierto.
 */
export class MultiplayerRoomManager {
  private rooms: Map<string, InternalRoom>;

  constructor() {
    this.rooms = new Map<string, InternalRoom>();
  }

  private createInternalRoom(roomId: string, maxPlayers: number, shardIndex = 1): InternalRoom | null {
    if (this.rooms.size >= MAX_ROOMS) {
      // Evictar salas vacías si se alcanzó el límite
      for (const [id, r] of this.rooms.entries()) {
        if (r.players.size === 0) {
          this.rooms.delete(id);
        }
        if (this.rooms.size < MAX_ROOMS) break;
      }
      if (this.rooms.size >= MAX_ROOMS) return null;
    }
    const room: InternalRoom = {
      roomId,
      shardIndex,
      maxPlayers: Math.max(1, Math.min(MAX_PLAYERS_PER_ROOM, Math.floor(maxPlayers || 16))),
      players: new Map<string, NetPlayerState>(),
      nodeCooldowns: new Map<string, RoomNodeCooldown>(),
      processedActions: new Set<string>(),
      actionQueue: [],
      createdAt: Date.now(),
    };
    this.rooms.set(roomId, room);
    return room;
  }

  private resolveTargetRoom(baseRoomId: string, maxPlayers: number, autoShard = true): InternalRoom | null {
    const cleanBase = sanitizeNetId(baseRoomId, 'global_1');
    const clampedMax = Math.max(1, Math.min(MAX_PLAYERS_PER_ROOM, Math.floor(maxPlayers || 16)));
    let candidate = this.rooms.get(cleanBase);
    if (!candidate) {
      return this.createInternalRoom(cleanBase, clampedMax, 1);
    }
    if (candidate.players.size < candidate.maxPlayers || !autoShard) {
      return candidate;
    }
    // Auto-sharding si la sala principal está llena
    for (let shard = 2; shard <= 16; shard++) {
      const shardId = `${cleanBase}_s${shard}`;
      let sRoom = this.rooms.get(shardId);
      if (!sRoom) {
        sRoom = this.createInternalRoom(shardId, clampedMax, shard) ?? undefined;
        if (sRoom) return sRoom;
      } else if (sRoom.players.size < sRoom.maxPlayers) {
        return sRoom;
      }
    }
    return candidate;
  }

  joinRoom(params: {
    roomId?: string;
    playerId?: string;
    name?: string;
    mode?: '2d' | '3d';
    sceneId?: string;
    maxPlayers?: number;
    autoShard?: boolean;
  }): { ok: boolean; roomId?: string; player?: NetPlayerState; snapshot?: RoomSnapshot; reason?: string } {
    const playerId = sanitizeNetId(params.playerId, `p_${Date.now().toString(36)}`);
    const requestedRoom = sanitizeNetId(params.roomId, 'global_1');
    const room = this.resolveTargetRoom(requestedRoom, params.maxPlayers ?? 16, params.autoShard !== false);
    if (!room) {
      return { ok: false, reason: 'Límite global de salas alcanzado.' };
    }
    if (!room.players.has(playerId) && room.players.size >= room.maxPlayers) {
      return { ok: false, reason: 'La sala está llena.' };
    }
    const now = Date.now();
    const player: NetPlayerState = {
      playerId,
      name: sanitizeLabel(params.name, playerId, 32),
      x: 0,
      y: 0,
      z: 0,
      rotY: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      animState: 'Idle',
      sceneId: sanitizeNetId(params.sceneId, 'main'),
      mode: params.mode === '3d' ? '3d' : '2d',
      updatedAt: now,
    };
    room.players.set(playerId, player);
    return {
      ok: true,
      roomId: room.roomId,
      player,
      snapshot: this.getRoomSnapshot(room.roomId, now) ?? undefined,
    };
  }

  leaveRoom(roomId: string, playerId: string): boolean {
    const cleanRoom = sanitizeNetId(roomId, '');
    const cleanPlayer = sanitizeNetId(playerId, '');
    const room = this.rooms.get(cleanRoom);
    if (!room) return false;
    const removed = room.players.delete(cleanPlayer);
    if (room.players.size === 0 && room.nodeCooldowns.size === 0) {
      this.rooms.delete(cleanRoom);
    }
    return removed;
  }

  updatePlayerState(
    roomId: string,
    playerId: string,
    patch: Partial<NetPlayerState>,
    now = Date.now()
  ): NetPlayerState | null {
    const cleanRoom = sanitizeNetId(roomId, '');
    const cleanPlayer = sanitizeNetId(playerId, '');
    const room = this.rooms.get(cleanRoom);
    if (!room) return null;
    const player = room.players.get(cleanPlayer);
    if (!player) return null;

    if (patch.x !== undefined) player.x = clampFinite(patch.x, player.x);
    if (patch.y !== undefined) player.y = clampFinite(patch.y, player.y);
    if (patch.z !== undefined) player.z = clampFinite(patch.z, player.z);
    if (patch.rotY !== undefined) player.rotY = clampFinite(patch.rotY, player.rotY, -3600, 3600);
    if (patch.vx !== undefined) player.vx = clampFinite(patch.vx, player.vx, -5000, 5000);
    if (patch.vy !== undefined) player.vy = clampFinite(patch.vy, player.vy, -5000, 5000);
    if (patch.vz !== undefined) player.vz = clampFinite(patch.vz, player.vz, -5000, 5000);
    if (patch.animState !== undefined) player.animState = sanitizeLabel(patch.animState, player.animState, 32);
    if (patch.sceneId !== undefined) player.sceneId = sanitizeNetId(patch.sceneId, player.sceneId);
    if (patch.mode !== undefined) player.mode = patch.mode === '3d' ? '3d' : '2d';
    player.updatedAt = now;
    return { ...player };
  }

  claimWorldNode(params: {
    roomId: string;
    playerId: string;
    nodeId: string;
    actionId: string;
    respawnSec: number;
    now?: number;
  }): RoomActionResult {
    const now = params.now ?? Date.now();
    const cleanRoom = sanitizeNetId(params.roomId, '');
    const cleanPlayer = sanitizeNetId(params.playerId, '');
    const cleanNode = sanitizeNetId(params.nodeId, '');
    const cleanAction = sanitizeNetId(params.actionId, '');
    const room = this.rooms.get(cleanRoom);
    if (!room || !room.players.has(cleanPlayer)) {
      return { ok: false, reason: 'Jugador o sala no válidos.' };
    }
    if (!cleanNode || !cleanAction) {
      return { ok: false, reason: 'nodeId/actionId requerido.' };
    }
    if (room.processedActions.has(cleanAction)) {
      return { ok: false, duplicate: true, reason: 'Acción ya procesada.' };
    }

    const existingCooldown = room.nodeCooldowns.get(cleanNode);
    if (existingCooldown && existingCooldown.respawnAt > now) {
      return {
        ok: false,
        reason: 'Nodo en tiempo de reaparición.',
        respawnAt: existingCooldown.respawnAt,
      };
    }

    room.processedActions.add(cleanAction);
    room.actionQueue.push(cleanAction);
    if (room.actionQueue.length > MAX_ACTION_HISTORY) {
      const oldest = room.actionQueue.shift();
      if (oldest) room.processedActions.delete(oldest);
    }

    const respawnMs = Math.max(0, Math.min(3600, Number(params.respawnSec) || 0)) * 1000;
    const respawnAt = now + respawnMs;
    if (respawnMs > 0) {
      room.nodeCooldowns.set(cleanNode, {
        nodeId: cleanNode,
        claimedBy: cleanPlayer,
        claimedAt: now,
        respawnAt,
      });
    } else {
      room.nodeCooldowns.delete(cleanNode);
    }

    return { ok: true, respawnAt };
  }

  getRoomSnapshot(roomId: string, now = Date.now()): RoomSnapshot | null {
    const cleanRoom = sanitizeNetId(roomId, '');
    const room = this.rooms.get(cleanRoom);
    if (!room) return null;

    // Purgar nodos ya reaparecidos
    for (const [nodeId, cd] of room.nodeCooldowns.entries()) {
      if (cd.respawnAt <= now) {
        room.nodeCooldowns.delete(nodeId);
      }
    }

    return {
      roomId: room.roomId,
      shardIndex: room.shardIndex,
      maxPlayers: room.maxPlayers,
      players: Array.from(room.players.values()).map((p) => ({ ...p })),
      unavailableNodes: Array.from(room.nodeCooldowns.values()).map((c) => ({ ...c })),
    };
  }

  listRooms(): Array<{ roomId: string; playerCount: number; maxPlayers: number; shardIndex: number }> {
    const out: Array<{ roomId: string; playerCount: number; maxPlayers: number; shardIndex: number }> = [];
    for (const r of this.rooms.values()) {
      out.push({
        roomId: r.roomId,
        playerCount: r.players.size,
        maxPlayers: r.maxPlayers,
        shardIndex: r.shardIndex,
      });
    }
    return out;
  }

  private rateWindows = new Map<string, number[]>();

  checkRateLimit(key: string, maxRequests = 35, windowMs = 1000, now = Date.now()): boolean {
    const bucket = this.rateWindows.get(key) ?? [];
    const cutoff = now - windowMs;
    const active = bucket.filter((ts) => ts > cutoff);
    if (active.length >= maxRequests) {
      this.rateWindows.set(key, active);
      return false;
    }
    active.push(now);
    this.rateWindows.set(key, active);
    if (this.rateWindows.size > 512) {
      for (const [k, arr] of this.rateWindows.entries()) {
        if (arr.length === 0 || arr[arr.length - 1] <= cutoff) {
          this.rateWindows.delete(k);
        }
      }
    }
    return true;
  }

  validateShopTransaction(params: {
    currentCurrency: number;
    unitPrice: number;
    quantity: number;
    maxStack?: number;
  }): { ok: boolean; totalCost: number; remainingCurrency: number; reason?: string } {
    const qty = Math.floor(Number(params.quantity));
    const price = Number(params.unitPrice);
    const currency = Number(params.currentCurrency);
    const maxStack = Math.max(1, Math.floor(params.maxStack ?? 999));
    if (!Number.isFinite(qty) || qty < 1 || qty > maxStack) {
      return { ok: false, totalCost: 0, remainingCurrency: currency, reason: 'Cantidad inválida.' };
    }
    if (!Number.isFinite(price) || price < 0 || price > 1e7) {
      return { ok: false, totalCost: 0, remainingCurrency: currency, reason: 'Precio inválido.' };
    }
    if (!Number.isFinite(currency) || currency < 0) {
      return { ok: false, totalCost: 0, remainingCurrency: 0, reason: 'Saldo inválido.' };
    }
    const totalCost = Math.round(price * qty * 100) / 100;
    if (currency < totalCost) {
      return { ok: false, totalCost, remainingCurrency: currency, reason: 'Fondos insuficientes.' };
    }
    return {
      ok: true,
      totalCost,
      remainingCurrency: Math.round((currency - totalCost) * 100) / 100,
    };
  }
}

const EPHEMERAL_SESSION_SECRET = randomBytes(32);

function getSessionSigningKey(): Buffer | string {
  const envKey = typeof process !== 'undefined' ? process.env?.NEXUS_SESSION_SECRET : undefined;
  return envKey && envKey.length >= 16 ? envKey : EPHEMERAL_SESSION_SECRET;
}

export function createPlayerSessionToken(playerId: string): string {
  const cleanId = sanitizeNetId(playerId, 'player');
  const mac = createHmac('sha256', getSessionSigningKey()).update(cleanId).digest('base64url');
  return `${cleanId}.${mac}`;
}

export function verifyPlayerSessionToken(playerId: string, token: unknown): boolean {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const cleanId = sanitizeNetId(playerId, '');
  if (!cleanId) return false;
  const expected = createPlayerSessionToken(cleanId);
  const a = Buffer.from(token.trim(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

