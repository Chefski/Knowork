import type { ActiveEntry, CompletedEntry } from '@apb/shared';

interface RoomMeta {
  code: string;
  created_at: number;
  last_active_at: number;
}

interface HealthInfo {
  ok: boolean;
  version: string;
  demo_banner: boolean;
}

export async function getHealth(): Promise<HealthInfo> {
  const res = await fetch('/health');
  if (!res.ok) throw new Error(`getHealth failed: ${res.status}`);
  return (await res.json()) as HealthInfo;
}

export async function createRoom(): Promise<{ code: string }> {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (!res.ok) throw new Error(`createRoom failed: ${res.status}`);
  return (await res.json()) as { code: string };
}

export async function getRoom(code: string): Promise<RoomMeta> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (res.status === 404) throw new Error('room_not_found');
  if (!res.ok) throw new Error(`getRoom failed: ${res.status}`);
  return (await res.json()) as RoomMeta;
}

export async function getActive(code: string): Promise<ActiveEntry[]> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/active`);
  if (!res.ok) throw new Error(`getActive failed: ${res.status}`);
  const body = (await res.json()) as { active: ActiveEntry[] };
  return body.active;
}

export async function getHistory(code: string): Promise<CompletedEntry[]> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/history`);
  if (!res.ok) throw new Error(`getHistory failed: ${res.status}`);
  const body = (await res.json()) as { entries: CompletedEntry[] };
  return body.entries;
}
