import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { nanoid } from 'nanoid';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerEvent } from '@apb/shared';
import type { Repository } from '../db/repository.js';
import type { RoomRegistry } from '../registry/registry.js';
import type { Logger } from '../logger.js';
import type { AppConfig } from '../config.js';

const ROOM_PATH_RE = /^\/ws\/([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6})$/;
const HEARTBEAT_INTERVAL_MS = 20_000;

export interface GatewayDeps {
  cfg: AppConfig;
  repo: Repository;
  registry: RoomRegistry;
  logger: Logger;
}

export class WebSocketGateway {
  private readonly wss: WebSocketServer;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: GatewayDeps) {
    this.wss = new WebSocketServer({ noServer: true });
  }

  attach(server: HttpServer): void {
    server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
    this.startHeartbeat();
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      for (const client of this.wss.clients) {
        try {
          client.close(1001, 'server shutting down');
        } catch {
          // ignore
        }
      }
      this.wss.close(() => resolve());
    });
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = req.url ?? '';
    const match = ROOM_PATH_RE.exec(url.split('?')[0] ?? '');
    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    const roomCode = match[1]!;
    if (!this.deps.repo.getRoom(roomCode)) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.onConnection(ws, roomCode);
    });
  }

  private onConnection(ws: WebSocket, roomCode: string): void {
    const room = this.deps.registry.getOrCreate(roomCode);
    const subId = nanoid(8);
    let alive = true;

    const sub = {
      id: subId,
      send: (event: ServerEvent) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
      },
      close: () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      },
    };

    room.addSubscriber(sub);

    const snapshot: ServerEvent = {
      type: 'snapshot',
      room: roomCode,
      data: {
        active: room.listActive(),
        recently_shipped: this.deps.repo.listRecentlyShipped(roomCode, this.deps.cfg.historyLimit),
      },
    };
    sub.send(snapshot);

    ws.on('pong', () => {
      alive = true;
    });

    ws.on('message', (raw) => {
      let msg: ClientMessage | null = null;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (msg && msg.type === 'ping') {
        sub.send({ type: 'pong', t: Date.now() });
      }
      // 'subscribe' is a no-op; everything else ignored silently.
    });

    ws.on('close', () => {
      room.removeSubscriber(sub);
    });

    ws.on('error', () => {
      room.removeSubscriber(sub);
    });

    // Per-connection liveness flag used by the global heartbeat sweep
    (ws as WebSocket & { __apb_alive?: boolean }).__apb_alive = true;
    ws.on('pong', () => {
      (ws as WebSocket & { __apb_alive?: boolean }).__apb_alive = true;
    });
    void alive;
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const ws of this.wss.clients) {
        const tagged = ws as WebSocket & { __apb_alive?: boolean };
        if (tagged.__apb_alive === false) {
          try {
            ws.terminate();
          } catch {
            // ignore
          }
          continue;
        }
        tagged.__apb_alive = false;
        try {
          ws.ping();
        } catch {
          // ignore
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }
}
