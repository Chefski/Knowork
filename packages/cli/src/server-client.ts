import { CliError } from './errors.js';

// We deliberately avoid pulling in a heavyweight HTTP library — the CLI ships
// with `npx`, so every transitive dep matters.

export interface RoomMetadata {
  code: string;
  protected?: boolean;
}

const DEFAULT_TIMEOUT_MS = 7_000;

export class ServerClient {
  constructor(private readonly serverUrl: string) {}

  // The operator may pass either the bare hostname (https://knowork.app) or
  // the MCP endpoint (https://knowork.app/mcp); strip a trailing /mcp so /api
  // lookups hit the right path.
  private apiBase(): string {
    return this.serverUrl.replace(/\/mcp\/?$/, '').replace(/\/+$/, '');
  }

  async fetchRoom(roomCode: string): Promise<RoomMetadata | null> {
    const url = `${this.apiBase()}/api/rooms/${encodeURIComponent(roomCode)}`;
    const res = await this.fetchWithTimeout(url, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new CliError(`Server returned ${res.status} for ${url}`, {
        remediation: 'Verify the --server URL and that the server is reachable.',
      });
    }
    const data = (await res.json()) as Partial<RoomMetadata>;
    return { code: data.code ?? roomCode, protected: data.protected === true };
  }

  async exchangePassword(roomCode: string, password: string): Promise<string> {
    const url = `${this.apiBase()}/api/rooms/${encodeURIComponent(roomCode)}/token`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new CliError('Server rejected the room password.', {
        remediation: 'Double-check `--password`. Tokens are not the same as passwords.',
      });
    }
    if (!res.ok) {
      throw new CliError(`Token exchange failed (${res.status}).`);
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) throw new CliError('Server returned no token field.');
    return data.token;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new CliError(`Could not reach Knowork server at ${url}: ${message}`, {
        remediation: 'Check your network and the --server URL.',
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
