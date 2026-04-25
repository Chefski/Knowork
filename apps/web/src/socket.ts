import type { ServerEvent } from '@apb/shared';

export interface RoomSocketHandlers {
  onEvent(event: ServerEvent): void;
  onOpen(): void;
  onClose(): void;
}

export class RoomSocket {
  private ws: WebSocket | null = null;
  private retries = 0;
  private closed = false;
  private retryHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly code: string,
    private readonly handlers: RoomSocketHandlers,
  ) {}

  connect(): void {
    this.closed = false;
    this.open();
  }

  close(): void {
    this.closed = true;
    if (this.retryHandle) {
      clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private open(): void {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws/${encodeURIComponent(this.code)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.retries = 0;
      this.handlers.onOpen();
    });

    ws.addEventListener('message', (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as ServerEvent;
        this.handlers.onEvent(event);
      } catch {
        // ignore malformed
      }
    });

    ws.addEventListener('close', () => {
      this.handlers.onClose();
      if (this.closed) return;
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      ws.close();
    });
  }

  private scheduleReconnect(): void {
    const base = Math.min(30_000, 1_000 * Math.pow(2, this.retries));
    const jitter = Math.floor(Math.random() * 500);
    const delay = base + jitter;
    this.retries += 1;
    this.retryHandle = setTimeout(() => this.open(), delay);
  }
}
