import { nanoid } from 'nanoid';
import type {
  ActiveEntry,
  AgentIdentity,
  CompletedEntry,
  CompletionReason,
  OverlapMatch,
  ServerEvent,
  WorkExpiredReason,
} from '@apb/shared';
import type { Repository } from '../db/repository.js';
import { AsyncMutex } from '../util/mutex.js';
import type { Subscriber } from './types.js';

export interface StartWorkArgs {
  agentIdentity: AgentIdentity;
  repo: string;
  branch: string | null;
  intent: string;
  files: string[];
  sessionId?: string;
}

export interface CheckOverlapArgs {
  repo: string;
  branch?: string;
  intent?: string;
  files?: string[];
}

export type CompleteOutcome =
  | { status: 'completed'; entry: CompletedEntry }
  | { status: 'not_found' }
  | { status: 'already_completed' };

export type HeartbeatOutcome = { status: 'ok' } | { status: 'not_found' };

const TOKEN_RE = /[a-z0-9_./-]+/gi;
const PATH_PART_RE = /[a-z0-9_-]+/gi;

function tokenize(text: string): Set<string> {
  return new Set(
    (text.match(TOKEN_RE) ?? []).map((t) => t.toLowerCase()).filter((t) => t.length > 2),
  );
}

function tokenizePath(path: string): Set<string> {
  return new Set(
    (path.match(PATH_PART_RE) ?? []).map((t) => t.toLowerCase()).filter((t) => t.length > 2),
  );
}

export class RoomState {
  readonly active = new Map<string, ActiveEntry>();
  // workId -> sessionId for entries created via stateful sessions. Entries without
  // a session_id (legacy stateless path) are absent from this map.
  private readonly entrySessions = new Map<string, string>();
  // sessionId -> set of workIds it owns. Reverse index for O(owned) cleanup on close.
  private readonly sessionEntries = new Map<string, Set<string>>();
  private readonly subscribers = new Set<Subscriber>();
  private readonly mutex = new AsyncMutex();

  constructor(
    readonly code: string,
    private readonly repo: Repository,
    private readonly now: () => number = () => Date.now(),
  ) {}

  startWork(args: StartWorkArgs): Promise<ActiveEntry> {
    return this.mutex.run(() => {
      const t = this.now();
      const entry: ActiveEntry = {
        work_id: nanoid(12),
        agent_identity: args.agentIdentity,
        tool: args.agentIdentity.tool,
        repo: args.repo,
        branch: args.branch,
        intent: args.intent,
        files: args.files,
        started_at: t,
        last_seen: t,
        disconnected_at: null,
      };
      this.active.set(entry.work_id, entry);
      if (args.sessionId) {
        this.entrySessions.set(entry.work_id, args.sessionId);
        let owned = this.sessionEntries.get(args.sessionId);
        if (!owned) {
          owned = new Set();
          this.sessionEntries.set(args.sessionId, owned);
        }
        owned.add(entry.work_id);
      }
      this.repo.touch(this.code, t);
      this.broadcast({ type: 'work_started', room: this.code, entry });
      return entry;
    });
  }

  heartbeat(workId: string): Promise<HeartbeatOutcome> {
    return this.mutex.run(() => {
      const entry = this.active.get(workId);
      if (!entry) return { status: 'not_found' };
      const lastSeen = this.now();
      entry.last_seen = lastSeen;
      this.broadcast({
        type: 'work_heartbeat',
        room: this.code,
        work_id: workId,
        last_seen: lastSeen,
      });
      return { status: 'ok' };
    });
  }

  completeWork(workId: string, summary: string | null): Promise<CompleteOutcome> {
    return this.mutex.run(() => {
      const entry = this.active.get(workId);
      if (!entry) {
        const existing = this.repo.getCompletedByWorkId(this.code, workId);
        if (!existing) return { status: 'not_found' };
        if (existing.completion_reason === 'completed') return { status: 'already_completed' };
        if (
          existing.completion_reason !== 'expired' &&
          existing.completion_reason !== 'session_closed' &&
          existing.completion_reason !== 'session_max_age'
        ) {
          return { status: 'already_completed' };
        }

        const completedAt = this.now();
        const completed = this.repo.markExpiredThenCompleted(
          this.code,
          workId,
          completedAt,
          summary,
        );
        if (!completed) return { status: 'already_completed' };

        this.repo.touch(this.code, completedAt);
        this.broadcast({
          type: 'work_completed',
          room: this.code,
          work_id: workId,
          entry: completed,
        });
        return { status: 'completed', entry: completed };
      }

      this.removeOwnership(workId);
      this.active.delete(workId);
      const completedAt = this.now();
      const completed: CompletedEntry = {
        id: 0,
        room_code: this.code,
        work_id: workId,
        agent_identity: entry.agent_identity,
        tool: entry.tool,
        repo: entry.repo,
        branch: entry.branch,
        intent: entry.intent,
        files: entry.files,
        started_at: entry.started_at,
        completed_at: completedAt,
        completion_reason: 'completed',
        summary,
      };
      this.repo.recordCompleted({
        roomCode: this.code,
        workId,
        agentIdentity: entry.agent_identity,
        tool: entry.tool,
        repo: entry.repo,
        branch: entry.branch,
        intent: entry.intent,
        files: entry.files,
        startedAt: entry.started_at,
        completedAt,
        completionReason: 'completed',
        summary,
      });
      const persisted = this.repo.getCompletedByWorkId(this.code, workId) ?? completed;
      this.repo.touch(this.code, completedAt);
      this.broadcast({
        type: 'work_completed',
        room: this.code,
        work_id: workId,
        entry: persisted,
      });
      return { status: 'completed', entry: persisted };
    });
  }

  /**
   * Mark every active entry owned by `sessionId` as disconnected and broadcast.
   * Returns the number of entries flagged. Does not start any timer — the registry
   * coordinates the single per-session grace timer that finalizes these entries.
   */
  markEntriesDisconnected(sessionId: string, t: number = this.now()): number {
    const owned = this.sessionEntries.get(sessionId);
    if (!owned || owned.size === 0) return 0;
    let flagged = 0;
    for (const workId of owned) {
      const entry = this.active.get(workId);
      if (!entry) continue;
      if (entry.disconnected_at) continue; // already flagged
      entry.disconnected_at = t;
      this.broadcast({
        type: 'work_session_disconnected',
        room: this.code,
        work_id: workId,
        entry,
        disconnected_at: t,
      });
      flagged++;
    }
    return flagged;
  }

  /**
   * Clear the disconnected flag on every entry owned by `sessionId` and broadcast
   * resume events. Called when the session reconnects within the grace window.
   */
  resumeEntries(sessionId: string, t: number = this.now()): number {
    const owned = this.sessionEntries.get(sessionId);
    if (!owned || owned.size === 0) return 0;
    let resumed = 0;
    for (const workId of owned) {
      const entry = this.active.get(workId);
      if (!entry) continue;
      if (!entry.disconnected_at) continue;
      entry.disconnected_at = null;
      // Refresh last_seen so any legacy heartbeat path stays accurate.
      entry.last_seen = t;
      this.broadcast({
        type: 'work_session_resumed',
        room: this.code,
        work_id: workId,
        entry,
        resumed_at: t,
      });
      resumed++;
    }
    return resumed;
  }

  /**
   * Finalize every entry owned by `sessionId` that is still flagged as
   * disconnected. Called when the registry-level grace timer fires.
   */
  finalizeDisconnectedSession(sessionId: string): CompletedEntry[] {
    const owned = this.sessionEntries.get(sessionId);
    if (!owned || owned.size === 0) return [];
    const expired: CompletedEntry[] = [];
    const stillOwned = Array.from(owned);
    for (const workId of stillOwned) {
      const entry = this.active.get(workId);
      if (!entry) continue;
      // Skip if the entry was reconnected (resume cleared the flag) or already
      // finalized via another path (admin, late complete_work, etc.).
      if (!entry.disconnected_at) continue;
      const finalized = this.finalizeEntry(workId, entry, 'session_closed');
      if (finalized) expired.push(finalized);
    }
    if (expired.length) this.repo.touch(this.code, this.now());
    return expired;
  }

  /**
   * Finalize entries whose `started_at` is older than the configured cap. Applies
   * to every entry regardless of session connectivity — this is the zombie backstop.
   */
  expireMaxAge(maxAgeMs: number): CompletedEntry[] {
    const cutoff = this.now() - maxAgeMs;
    const expired: CompletedEntry[] = [];
    for (const [workId, entry] of this.active) {
      if (entry.started_at < cutoff) {
        const finalized = this.finalizeEntry(workId, entry, 'session_max_age');
        if (finalized) expired.push(finalized);
      }
    }
    if (expired.length) this.repo.touch(this.code, this.now());
    return expired;
  }

  /**
   * Legacy stateless heartbeat sweep — applies the wall-clock `last_seen` rule
   * ONLY to entries that have no owning session (legacy stateless transport path).
   * Session-bound entries are exempt; their liveness is governed by the connection.
   */
  expireStale(maxAgeMs: number): CompletedEntry[] {
    const cutoff = this.now() - maxAgeMs;
    const expired: CompletedEntry[] = [];
    for (const [workId, entry] of this.active) {
      if (this.entrySessions.has(workId)) continue; // session-bound; skip
      if (entry.last_seen < cutoff) {
        const finalized = this.finalizeEntry(workId, entry, 'heartbeat_missed');
        if (finalized) expired.push(finalized);
      }
    }
    if (expired.length) this.repo.touch(this.code, this.now());
    return expired;
  }

  private finalizeEntry(
    workId: string,
    entry: ActiveEntry,
    reason: WorkExpiredReason,
  ): CompletedEntry | null {
    this.removeOwnership(workId);
    this.active.delete(workId);
    const completedAt = this.now();
    const completionReason: CompletionReason =
      reason === 'heartbeat_missed' ? 'expired' : reason;
    const completed: CompletedEntry = {
      id: 0,
      room_code: this.code,
      work_id: workId,
      agent_identity: entry.agent_identity,
      tool: entry.tool,
      repo: entry.repo,
      branch: entry.branch,
      intent: entry.intent,
      files: entry.files,
      started_at: entry.started_at,
      completed_at: completedAt,
      completion_reason: completionReason,
      summary: null,
    };
    this.repo.recordCompleted({
      roomCode: this.code,
      workId,
      agentIdentity: entry.agent_identity,
      tool: entry.tool,
      repo: entry.repo,
      branch: entry.branch,
      intent: entry.intent,
      files: entry.files,
      startedAt: entry.started_at,
      completedAt,
      completionReason,
      summary: null,
    });
    const persisted = this.repo.getCompletedByWorkId(this.code, workId) ?? completed;
    this.broadcast({
      type: 'work_expired',
      room: this.code,
      work_id: workId,
      entry: persisted,
      reason,
    });
    return persisted;
  }

  private removeOwnership(workId: string): void {
    const sessionId = this.entrySessions.get(workId);
    if (!sessionId) return;
    this.entrySessions.delete(workId);
    const owned = this.sessionEntries.get(sessionId);
    if (owned) {
      owned.delete(workId);
      if (owned.size === 0) this.sessionEntries.delete(sessionId);
    }
  }

  hasSession(sessionId: string): boolean {
    const owned = this.sessionEntries.get(sessionId);
    return !!owned && owned.size > 0;
  }

  checkOverlap(args: CheckOverlapArgs): OverlapMatch[] {
    const matches: OverlapMatch[] = [];
    const repoLower = args.repo.toLowerCase();
    const branchLower = args.branch?.toLowerCase();
    const intentTokens = args.intent ? tokenize(args.intent) : new Set<string>();
    const fileTokens = new Set<string>();
    const filesLower = (args.files ?? []).map((f) => f.toLowerCase());
    for (const f of filesLower) for (const t of tokenizePath(f)) fileTokens.add(t);

    for (const entry of this.active.values()) {
      if (entry.repo.toLowerCase() !== repoLower) continue;

      const reasons: string[] = [];

      if (branchLower && entry.branch) {
        const entryBranch = entry.branch.toLowerCase();
        if (
          entryBranch === branchLower ||
          entryBranch.includes(branchLower) ||
          branchLower.includes(entryBranch)
        ) {
          reasons.push(`same branch (${entry.branch})`);
        }
      }

      if (filesLower.length > 0) {
        const exact = entry.files.filter((f) => filesLower.includes(f.toLowerCase()));
        if (exact.length > 0) {
          reasons.push(`overlapping file${exact.length > 1 ? 's' : ''}: ${exact.join(', ')}`);
        } else if (fileTokens.size > 0) {
          const fuzzy: string[] = [];
          for (const f of entry.files) {
            const entryFileTokens = tokenizePath(f);
            for (const t of entryFileTokens) {
              if (fileTokens.has(t)) {
                fuzzy.push(f);
                break;
              }
            }
          }
          if (fuzzy.length > 0) {
            reasons.push(
              `related file${fuzzy.length > 1 ? 's' : ''}: ${fuzzy.slice(0, 3).join(', ')}`,
            );
          }
        }
      }

      if (intentTokens.size > 0) {
        const entryTokens = tokenize(entry.intent);
        const shared: string[] = [];
        for (const t of intentTokens) if (entryTokens.has(t)) shared.push(t);
        if (shared.length >= 2) {
          reasons.push(`shared intent keywords: ${shared.slice(0, 5).join(', ')}`);
        }
      }

      if (reasons.length === 0) {
        reasons.push(`same repo (${entry.repo})`);
      }

      matches.push({ entry, reason: reasons.join('; ') });
    }
    return matches;
  }

  listActive(): ActiveEntry[] {
    return Array.from(this.active.values());
  }

  addSubscriber(sub: Subscriber): void {
    this.subscribers.add(sub);
  }

  removeSubscriber(sub: Subscriber): void {
    this.subscribers.delete(sub);
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  broadcast(event: ServerEvent): void {
    for (const sub of this.subscribers) {
      try {
        sub.send(event);
      } catch {
        // dead socket; gateway will reap on close
      }
    }
  }
}
