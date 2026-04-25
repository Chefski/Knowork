export interface AgentIdentity {
  name: string;
  tool: string;
}

export type CompletionReason =
  | 'completed'
  | 'expired'
  | 'expired_then_completed'
  | 'session_closed'
  | 'session_max_age';

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
  disconnected_at?: number | null;
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

export type WorkExpiredReason = 'session_closed' | 'session_max_age' | 'heartbeat_missed';

export type ServerEvent =
  | { type: 'snapshot'; room: string; data: SnapshotPayload }
  | { type: 'work_started'; room: string; entry: ActiveEntry }
  | { type: 'work_heartbeat'; room: string; work_id: string; last_seen: number }
  | {
      type: 'work_session_disconnected';
      room: string;
      work_id: string;
      entry: ActiveEntry;
      disconnected_at: number;
    }
  | {
      type: 'work_session_resumed';
      room: string;
      work_id: string;
      entry: ActiveEntry;
      resumed_at: number;
    }
  | { type: 'work_completed'; room: string; work_id: string; entry: CompletedEntry }
  | {
      type: 'work_expired';
      room: string;
      work_id: string;
      entry: CompletedEntry;
      reason: WorkExpiredReason;
    }
  | { type: 'pong'; t: number };

export type ClientMessage = { type: 'subscribe' } | { type: 'ping'; t?: number };

export interface OverlapMatch {
  entry: ActiveEntry;
  reason: string;
}
