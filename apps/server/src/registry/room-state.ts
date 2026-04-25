import { nanoid } from 'nanoid';
import type {
  ActiveEntry,
  AgentIdentity,
  CompletedEntry,
  OverlapMatch,
  ServerEvent,
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
      };
      this.active.set(entry.work_id, entry);
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
        if (existing.completion_reason !== 'expired') return { status: 'already_completed' };

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

  expireStale(maxAgeMs: number): CompletedEntry[] {
    const cutoff = this.now() - maxAgeMs;
    const expired: CompletedEntry[] = [];
    for (const [workId, entry] of this.active) {
      if (entry.last_seen < cutoff) {
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
          completion_reason: 'expired',
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
          completionReason: 'expired',
          summary: null,
        });
        const persisted = this.repo.getCompletedByWorkId(this.code, workId) ?? completed;
        expired.push(persisted);
        this.broadcast({
          type: 'work_expired',
          room: this.code,
          work_id: workId,
          entry: persisted,
          reason: 'heartbeat_missed',
        });
      }
    }
    if (expired.length) this.repo.touch(this.code, this.now());
    return expired;
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
