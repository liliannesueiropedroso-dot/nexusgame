import type { EventBus } from '../wiring/eventBus';
import type { NetPlayerState, RoomSnapshot } from './roomState';

export interface MultiplayerConnectOptions {
  roomId: string;
  playerId: string;
  playerName?: string;
  mode: '2d' | '3d';
  sceneId: string;
  maxPlayers?: number;
  syncRateHz?: number;
  url?: string;
  bus?: EventBus;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private bus: EventBus | null = null;
  private opts: MultiplayerConnectOptions | null = null;
  private connected = false;
  private assignedRoomId = '';
  private remotePlayers = new Map<string, NetPlayerState>();
  private unavailableNodes = new Map<string, number>();
  private lastSendAt = 0;
  private sendIntervalMs = 80;
  private sessionToken: string | null = null;
  private onStatusChange?: (status: { connected: boolean; roomId: string; playerCount: number }) => void;

  constructor(onStatusChange?: (status: { connected: boolean; roomId: string; playerCount: number }) => void) {
    this.onStatusChange = onStatusChange;
  }

  connect(opts: MultiplayerConnectOptions): void {
    this.disconnect();
    this.opts = opts;
    this.bus = opts.bus ?? null;
    const hz = Math.max(2, Math.min(30, opts.syncRateHz ?? 12));
    this.sendIntervalMs = Math.round(1000 / hz);

    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = opts.url || `${proto}//${window.location.host}/ws/multiplayer`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.addEventListener('open', () => {
        this.connected = true;
        this.sendRaw({
          type: 'join',
          roomId: opts.roomId || 'global_1',
          playerId: opts.playerId,
          name: opts.playerName || opts.playerId,
          mode: opts.mode,
          sceneId: opts.sceneId,
          maxPlayers: opts.maxPlayers ?? 16,
        });
        this.emitStatus();
      });

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
          this.handleMessage(msg);
        } catch {
          // Ignorar tramas no válidas
        }
      });

      ws.addEventListener('close', () => {
        this.connected = false;
        this.emitStatus();
      });

      ws.addEventListener('error', () => {
        this.connected = false;
        this.emitStatus();
      });
    } catch {
      this.connected = false;
      this.emitStatus();
    }
  }

  disconnect(): void {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN && this.opts) {
          this.sendRaw({
            type: 'leave',
            roomId: this.assignedRoomId || this.opts.roomId,
            playerId: this.opts.playerId,
          });
        }
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.connected = false;
    this.remotePlayers.clear();
    this.unavailableNodes.clear();
    this.emitStatus();
  }

  private emitStatus(): void {
    this.onStatusChange?.({
      connected: this.connected,
      roomId: this.assignedRoomId || this.opts?.roomId || '',
      playerCount: this.remotePlayers.size + (this.connected ? 1 : 0),
    });
  }

  private sendRaw(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const myId = this.opts?.playerId;
    if (msg.type === 'room_snapshot') {
      if (typeof msg.sessionToken === 'string') {
        this.sessionToken = msg.sessionToken;
      }
      const snap = msg.snapshot as RoomSnapshot | undefined;
      if (!snap) return;
      this.assignedRoomId = snap.roomId;
      this.remotePlayers.clear();
      for (const p of snap.players) {
        if (p.playerId !== myId) {
          this.remotePlayers.set(p.playerId, p);
        }
      }
      this.unavailableNodes.clear();
      const now = Date.now();
      for (const n of snap.unavailableNodes) {
        if (n.respawnAt > now) {
          this.unavailableNodes.set(n.nodeId, n.respawnAt);
        }
      }
      this.bus?.emit('net:roomJoined', { roomId: snap.roomId, snapshot: snap });
      this.emitStatus();
      return;
    }

    if (msg.type === 'player_joined' || msg.type === 'player_state') {
      const p = msg.player as NetPlayerState | undefined;
      if (!p || p.playerId === myId) return;
      this.remotePlayers.set(p.playerId, p);
      if (msg.type === 'player_joined') {
        this.bus?.emit('net:playerJoined', { player: p });
      }
      this.emitStatus();
      return;
    }

    if (msg.type === 'player_left') {
      const pid = String(msg.playerId ?? '');
      this.remotePlayers.delete(pid);
      this.bus?.emit('net:playerLeft', { playerId: pid });
      this.emitStatus();
      return;
    }

    if (msg.type === 'node_claimed') {
      const nodeId = String(msg.nodeId ?? '');
      const respawnAt = Number(msg.respawnAt ?? 0);
      if (nodeId && respawnAt > Date.now()) {
        this.unavailableNodes.set(nodeId, respawnAt);
      }
      this.bus?.emit('net:nodeClaimed', msg);
      return;
    }

    if (msg.type === 'emote') {
      this.bus?.emit('net:emote', msg);
    }
  }

  sendLocalTransform(state: {
    x: number;
    y: number;
    z?: number;
    rotY?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    animState?: string;
    sceneId?: string;
  }): void {
    if (!this.connected || !this.opts) return;
    const now = performance.now();
    if (now - this.lastSendAt < this.sendIntervalMs) return;
    this.lastSendAt = now;

    this.sendRaw({
      type: 'state_update',
      roomId: this.assignedRoomId || this.opts.roomId,
      playerId: this.opts.playerId,
      x: state.x,
      y: state.y,
      z: state.z ?? 0,
      rotY: state.rotY ?? 0,
      vx: state.vx ?? 0,
      vy: state.vy ?? 0,
      vz: state.vz ?? 0,
      animState: state.animState ?? 'Idle',
      sceneId: state.sceneId ?? this.opts.sceneId,
    });
  }

  claimNode(nodeId: string, actionId: string, respawnSec: number): void {
    if (!this.connected || !this.opts) return;
    this.sendRaw({
      type: 'collect_node',
      roomId: this.assignedRoomId || this.opts.roomId,
      playerId: this.opts.playerId,
      nodeId,
      actionId,
      respawnSec,
    });
  }

  sendEmote(emote: string): void {
    if (!this.connected || !this.opts) return;
    this.sendRaw({
      type: 'emote',
      roomId: this.assignedRoomId || this.opts.roomId,
      playerId: this.opts.playerId,
      emote: emote.slice(0, 32),
    });
  }

  getRemotePlayers(sceneId?: string): NetPlayerState[] {
    const out: NetPlayerState[] = [];
    for (const p of this.remotePlayers.values()) {
      if (!sceneId || p.sceneId === sceneId) {
        out.push(p);
      }
    }
    return out;
  }

  isNodeUnavailable(nodeId: string): boolean {
    const until = this.unavailableNodes.get(nodeId);
    if (!until) return false;
    if (Date.now() >= until) {
      this.unavailableNodes.delete(nodeId);
      return false;
    }
    return true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getRoomId(): string {
    return this.assignedRoomId || this.opts?.roomId || '';
  }

  getSessionToken(): string | null {
    return this.sessionToken;
  }
}
