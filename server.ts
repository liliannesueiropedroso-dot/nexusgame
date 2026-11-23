import express from 'express';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  createPlayerSessionToken,
  MultiplayerRoomManager,
  sanitizeNetId,
  verifyPlayerSessionToken,
} from './src/engine/multiplayer/roomState.ts';

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';
const SAVE_DIR = path.resolve(process.cwd(), '.nexus-saves');
const MAX_WS_PAYLOAD_BYTES = 16 * 1024;

interface SocketMeta {
  roomId: string;
  playerId: string;
}

function getSafeSaveFilePath(rawPlayerId: string): string | null {
  const safe = sanitizeNetId(rawPlayerId, '');
  if (!safe || safe !== rawPlayerId.trim()) return null;
  const resolved = path.resolve(SAVE_DIR, `${safe}.json`);
  if (!resolved.startsWith(`${SAVE_DIR}${path.sep}`)) return null;
  return resolved;
}

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  const roomManager = new MultiplayerRoomManager();
  const socketMeta = new WeakMap<WebSocket, SocketMeta>();
  const roomSockets = new Map<string, Set<WebSocket>>();

  function broadcastToRoom(roomId: string, payload: Record<string, unknown>, exclude?: WebSocket): void {
    const clients = roomSockets.get(roomId);
    if (!clients) return;
    const raw = JSON.stringify(payload);
    for (const client of clients) {
      if (client === exclude) continue;
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  function detachSocket(ws: WebSocket): void {
    const meta = socketMeta.get(ws);
    if (!meta) return;
    socketMeta.delete(ws);
    const set = roomSockets.get(meta.roomId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        roomSockets.delete(meta.roomId);
      }
    }
    const removed = roomManager.leaveRoom(meta.roomId, meta.playerId);
    if (removed) {
      broadcastToRoom(meta.roomId, {
        type: 'player_left',
        roomId: meta.roomId,
        playerId: meta.playerId,
      });
    }
  }

  app.get('/api/multiplayer/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'nexus-multiplayer',
      rooms: roomManager.listRooms().length,
    });
  });

  app.get('/api/multiplayer/rooms', (_req, res) => {
    res.json({ ok: true, rooms: roomManager.listRooms() });
  });

  const claimedSessionPlayers = new Set<string>();

  app.post('/api/session/token', (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    const rawId = typeof body?.playerId === 'string' ? body.playerId : `p_${Date.now().toString(36)}`;
    const playerId = sanitizeNetId(rawId, '');
    if (!playerId) {
      res.status(400).json({ ok: false, error: 'playerId inválido' });
      return;
    }
    const existingToken = req.header('x-nexus-player-token');
    if (claimedSessionPlayers.has(playerId) && !verifyPlayerSessionToken(playerId, existingToken)) {
      res.status(403).json({ ok: false, error: 'playerId ya reclamado por otra sesión' });
      return;
    }
    claimedSessionPlayers.add(playerId);
    const token = createPlayerSessionToken(playerId);
    res.json({ ok: true, playerId, token });
  });

  app.get('/api/save/:playerId', async (req, res) => {
    const targetPath = getSafeSaveFilePath(req.params.playerId);
    if (!targetPath) {
      res.status(400).json({ ok: false, error: 'playerId inválido' });
      return;
    }
    const token = req.header('x-nexus-player-token');
    if (!verifyPlayerSessionToken(req.params.playerId, token)) {
      res.status(401).json({ ok: false, error: 'Token de sesión requerido o inválido' });
      return;
    }
    try {
      const content = await fs.readFile(targetPath, 'utf8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      res.json({ ok: true, state: parsed });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENOENT') {
        res.status(404).json({ ok: false, error: 'Guardado no encontrado' });
        return;
      }
      res.status(500).json({ ok: false, error: 'No se pudo leer el guardado' });
    }
  });

  app.post('/api/save/:playerId', async (req, res) => {
    const targetPath = getSafeSaveFilePath(req.params.playerId);
    if (!targetPath) {
      res.status(400).json({ ok: false, error: 'playerId inválido' });
      return;
    }
    const token = req.header('x-nexus-player-token');
    if (!verifyPlayerSessionToken(req.params.playerId, token)) {
      res.status(401).json({ ok: false, error: 'Token de sesión requerido o inválido' });
      return;
    }
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ ok: false, error: 'Cuerpo JSON inválido' });
      return;
    }
    const serialized = JSON.stringify({
      ...body,
      playerId: sanitizeNetId(req.params.playerId, 'player'),
      updatedAt: Date.now(),
    });
    if (Buffer.byteLength(serialized, 'utf8') > 250 * 1024) {
      res.status(413).json({ ok: false, error: 'Guardado excede el límite permitido' });
      return;
    }
    try {
      await fs.mkdir(SAVE_DIR, { recursive: true });
      await fs.writeFile(targetPath, serialized, 'utf8');
      res.json({ ok: true, savedAt: Date.now() });
    } catch {
      res.status(500).json({ ok: false, error: 'No se pudo escribir el guardado' });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = createServer(app);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WS_PAYLOAD_BYTES,
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const urlPath = (request.url || '').split('?')[0];
    if (urlPath === '/ws/multiplayer') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(msg.type || '');
      if (type === 'join') {
        detachSocket(ws);
        const joined = roomManager.joinRoom({
          roomId: typeof msg.roomId === 'string' ? msg.roomId : 'global_1',
          playerId: typeof msg.playerId === 'string' ? msg.playerId : undefined,
          name: typeof msg.name === 'string' ? msg.name : undefined,
          mode: msg.mode === '3d' ? '3d' : '2d',
          sceneId: typeof msg.sceneId === 'string' ? msg.sceneId : 'main',
          maxPlayers: typeof msg.maxPlayers === 'number' ? msg.maxPlayers : 16,
          autoShard: msg.autoShard !== false,
        });
        if (!joined.ok || !joined.roomId || !joined.player || !joined.snapshot) {
          ws.send(JSON.stringify({ type: 'error', reason: joined.reason ?? 'No se pudo unir' }));
          return;
        }
        socketMeta.set(ws, { roomId: joined.roomId, playerId: joined.player.playerId });
        let set = roomSockets.get(joined.roomId);
        if (!set) {
          set = new Set<WebSocket>();
          roomSockets.set(joined.roomId, set);
        }
        set.add(ws);

        const sessionToken = createPlayerSessionToken(joined.player.playerId);
        claimedSessionPlayers.add(joined.player.playerId);
        ws.send(JSON.stringify({ type: 'room_snapshot', snapshot: joined.snapshot, sessionToken }));
        broadcastToRoom(
          joined.roomId,
          { type: 'player_joined', roomId: joined.roomId, player: joined.player },
          ws
        );
        return;
      }

      if (type === 'leave') {
        detachSocket(ws);
        return;
      }

      const meta = socketMeta.get(ws);
      if (!meta) return;

      if (type === 'state_update') {
        if (!roomManager.checkRateLimit(`ws:${meta.roomId}:${meta.playerId}`, 35, 1000)) {
          return;
        }
        const updated = roomManager.updatePlayerState(meta.roomId, meta.playerId, {
          x: msg.x as number,
          y: msg.y as number,
          z: msg.z as number,
          rotY: msg.rotY as number,
          vx: msg.vx as number,
          vy: msg.vy as number,
          vz: msg.vz as number,
          animState: msg.animState as string,
          sceneId: msg.sceneId as string,
        });
        if (updated) {
          broadcastToRoom(
            meta.roomId,
            { type: 'player_state', roomId: meta.roomId, player: updated },
            ws
          );
        }
        return;
      }

      if (type === 'collect_node') {
        const res = roomManager.claimWorldNode({
          roomId: meta.roomId,
          playerId: meta.playerId,
          nodeId: String(msg.nodeId || ''),
          actionId: String(msg.actionId || ''),
          respawnSec: Number(msg.respawnSec || 15),
        });
        if (res.ok) {
          broadcastToRoom(meta.roomId, {
            type: 'node_claimed',
            roomId: meta.roomId,
            nodeId: sanitizeNetId(msg.nodeId, ''),
            claimedBy: meta.playerId,
            respawnAt: res.respawnAt,
          });
        } else {
          ws.send(
            JSON.stringify({
              type: 'action_rejected',
              nodeId: sanitizeNetId(msg.nodeId, ''),
              duplicate: Boolean(res.duplicate),
              reason: res.reason ?? 'Rechazado',
            })
          );
        }
        return;
      }

      if (type === 'emote') {
        const emote = typeof msg.emote === 'string' ? msg.emote.replace(/[<>]/g, '').slice(0, 32) : 'wave';
        broadcastToRoom(meta.roomId, {
          type: 'emote',
          roomId: meta.roomId,
          playerId: meta.playerId,
          emote,
        });
      }
    });

    ws.on('close', () => detachSocket(ws));
    ws.on('error', () => detachSocket(ws));
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`[NEXUS] Servidor y multijugador WebSocket escuchando en http://${HOST}:${PORT}`);
  });
}

void startServer();
