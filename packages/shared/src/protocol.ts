export interface AgentIdentity {
  name: string;
  tool: string;
}

export type CompletionReason = 'completed' | 'expired' | 'expired_then_completed';

export interface ActiveEntry {
  work_id: string;
  agent_identity: AgentIdentity;
  tool: string;
  repo: string;
  branch: string | null;
  intent: string;
  files: string[];
  started_at: number;
  last_seen: number;
}

export interface CompletedEntry {
  id: number;
  room_code: string;
  work_id: string | null;
  agent_identity: AgentIdentity;
  tool: string;
  repo: string;
  branch: string | null;
  intent: string;
  files: string[];
  started_at: number;
  completed_at: number;
  completion_reason: CompletionReason;
  summary: string | null;
}

export interface SnapshotPayload {
  active: ActiveEntry[];
  recently_shipped: CompletedEntry[];
}

export type ServerEvent =
  | { type: 'snapshot'; room: string; data: SnapshotPayload }
  | { type: 'work_started'; room: string; entry: ActiveEntry }
  | { type: 'work_heartbeat'; room: string; work_id: string; last_seen: number }
  | { type: 'work_completed'; room: string; work_id: string; entry: CompletedEntry }
  | {
      type: 'work_expired';
      room: string;
      work_id: string;
      entry: CompletedEntry;
      reason: 'heartbeat_missed';
    }
  | { type: 'pong'; t: number };

export type ClientMessage = { type: 'subscribe' } | { type: 'ping'; t?: number };

export interface OverlapMatch {
  entry: ActiveEntry;
  reason: string;
}
