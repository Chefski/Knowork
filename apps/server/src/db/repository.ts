import type { AgentIdentity, CompletionReason } from '@apb/shared';
import type { Db } from './sqlite.js';

export interface RoomRow {
  code: string;
  created_at: number;
  last_active_at: number;
}

export interface CompletedEntryRow {
  id: number;
  room_code: string;
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

export interface RecordCompletedInput {
  roomCode: string;
  agentIdentity: AgentIdentity;
  tool: string;
  repo: string;
  branch: string | null;
  intent: string;
  files: string[];
  startedAt: number;
  completedAt: number;
  completionReason: CompletionReason;
  summary: string | null;
}

interface RawRoomRow {
  code: string;
  created_at: number;
  last_active_at: number;
}

interface RawCompletedRow {
  id: number;
  room_code: string;
  agent_identity_json: string;
  tool: string;
  repo: string;
  branch: string | null;
  intent: string;
  files_json: string;
  started_at: number;
  completed_at: number;
  completion_reason: string;
  summary: string | null;
}

export class Repository {
  private readonly insertRoom;
  private readonly selectRoom;
  private readonly touchRoom;
  private readonly insertCompleted;
  private readonly selectRecent;

  constructor(private readonly db: Db) {
    this.insertRoom = db.prepare(
      'INSERT INTO rooms (code, created_at, last_active_at) VALUES (?, ?, ?)',
    );
    this.selectRoom = db.prepare('SELECT code, created_at, last_active_at FROM rooms WHERE code = ?');
    this.touchRoom = db.prepare('UPDATE rooms SET last_active_at = ? WHERE code = ?');
    this.insertCompleted = db.prepare(`
      INSERT INTO completed_entries (
        room_code, agent_identity_json, tool, repo, branch, intent, files_json,
        started_at, completed_at, completion_reason, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.selectRecent = db.prepare(`
      SELECT id, room_code, agent_identity_json, tool, repo, branch, intent, files_json,
             started_at, completed_at, completion_reason, summary
      FROM completed_entries
      WHERE room_code = ?
      ORDER BY completed_at DESC
      LIMIT ?
    `);
  }

  createRoom(code: string, now = Date.now()): RoomRow {
    this.insertRoom.run(code, now, now);
    return { code, created_at: now, last_active_at: now };
  }

  getRoom(code: string): RoomRow | null {
    const row = this.selectRoom.get(code) as RawRoomRow | undefined;
    return row ?? null;
  }

  touch(code: string, now = Date.now()): void {
    this.touchRoom.run(now, code);
  }

  recordCompleted(input: RecordCompletedInput): void {
    this.insertCompleted.run(
      input.roomCode,
      JSON.stringify(input.agentIdentity),
      input.tool,
      input.repo,
      input.branch,
      input.intent,
      JSON.stringify(input.files),
      input.startedAt,
      input.completedAt,
      input.completionReason,
      input.summary,
    );
  }

  listRecentlyShipped(roomCode: string, limit: number): CompletedEntryRow[] {
    const rows = this.selectRecent.all(roomCode, limit) as RawCompletedRow[];
    return rows.map((row) => ({
      id: row.id,
      room_code: row.room_code,
      agent_identity: JSON.parse(row.agent_identity_json) as AgentIdentity,
      tool: row.tool,
      repo: row.repo,
      branch: row.branch,
      intent: row.intent,
      files: JSON.parse(row.files_json) as string[],
      started_at: row.started_at,
      completed_at: row.completed_at,
      completion_reason: row.completion_reason as CompletionReason,
      summary: row.summary,
    }));
  }
}
