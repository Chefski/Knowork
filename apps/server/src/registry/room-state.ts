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

function tokenize(text: string): Set<string> {
  return new Set(
    (text.match(TOKEN_RE) ?? []).map((t) => t.toLowerCase()).filter((t) => t.length > 2),
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
      entry.last_seen = this.now();
      return { status: 'ok' };
    });
  }

  completeWork(workId: string, summary: string | null): Promise<CompleteOutcome> {
    return this.mutex.run(() => {
      const entry = this.active.get(workId);
      if (!entry) return { status: 'not_found' };
      this.active.delete(workId);
      const completedAt = this.now();
      const completed: CompletedEntry = {
        id: 0,
        room_code: this.code,
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
      this.repo.touch(this.code, completedAt);
      this.broadcast({ type: 'work_completed', room: this.code, entry: completed });
      return { status: 'completed', entry: completed };
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
        expired.push(completed);
        this.broadcast({
          type: 'work_expired',
          room: this.code,
          entry: completed,
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
    const fileSet = new Set((args.files ?? []).map((f) => f.toLowerCase()));

    for (const entry of this.active.values()) {
      if (entry.repo.toLowerCase() !== repoLower) continue;

      const reasons: string[] = [];

      if (branchLower && entry.branch && entry.branch.toLowerCase() === branchLower) {
        reasons.push(`same branch (${entry.branch})`);
      }

      if (fileSet.size > 0) {
        const overlap = entry.files.filter((f) => fileSet.has(f.toLowerCase()));
        if (overlap.length > 0) {
          reasons.push(`overlapping file${overlap.length > 1 ? 's' : ''}: ${overlap.join(', ')}`);
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
