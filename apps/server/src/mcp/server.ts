import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CheckOverlapInputSchema,
  CompleteWorkInputSchema,
  HeartbeatInputSchema,
  KNOWORK_PROTOCOL_TEXT,
  ListActiveInputSchema,
  StartWorkInputSchema,
} from '@apb/shared';
import type { Repository } from '../db/repository.js';
import type { RoomRegistry } from '../registry/registry.js';
import type { Logger } from '../logger.js';

export interface McpDeps {
  repo: Repository;
  registry: RoomRegistry;
  logger: Logger;
}

interface ToolError {
  code: string;
  message: string;
}

function toolErrorResult(err: ToolError) {
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: `${err.code}: ${err.message}` }],
    structuredContent: { error: err },
  };
}

export function buildMcpServer(deps: McpDeps): McpServer {
  const { repo, registry } = deps;

  const server = new McpServer(
    {
      name: 'agent-presence-board',
      version: '0.1.0',
    },
    { instructions: KNOWORK_PROTOCOL_TEXT },
  );

  server.registerTool(
    'check_overlap',
    {
      title: 'Check overlap with active work in this room',
      description:
        'Call this BEFORE starting any non-trivial unit of work, with the room code, repo, intent, and any files you plan to touch. Returns active work entries whose repo, branch, intent keywords, or files overlap with the caller. Advisory only — does not block start_work, but if a teammate is already on it you should stop and tell the user.',
      inputSchema: CheckOverlapInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input) => {
      const room = repo.getRoom(input.room);
      if (!room) return toolErrorResult({ code: 'room_not_found', message: input.room });
      const state = registry.getOrCreate(input.room);
      const matches = state.checkOverlap({
        repo: input.repo,
        branch: input.branch,
        intent: input.intent,
        files: input.files,
      });
      const summary = matches.length
        ? matches
            .map(
              (m) =>
                `• ${m.entry.agent_identity.name} (${m.entry.tool}) — ${m.entry.intent} [${m.reason}]`,
            )
            .join('\n')
        : 'No overlapping active work in this room.';
      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: { matches },
      };
    },
  );

  server.registerTool(
    'start_work',
    {
      title: 'Announce that this agent has started a unit of work',
      description:
        'Call this AFTER `check_overlap` clears, when you actually begin a unit of work. Registers a new active entry in the room and returns a `work_id`. Presence is automatic while your MCP session is connected — you only need to call `complete_work` when you finish.',
      inputSchema: StartWorkInputSchema.shape,
    },
    async (input, extra) => {
      const room = repo.getRoom(input.room);
      if (!room) return toolErrorResult({ code: 'room_not_found', message: input.room });
      const state = registry.getOrCreate(input.room);
      const entry = await state.startWork({
        agentIdentity: input.agent_identity,
        repo: input.repo,
        branch: input.branch ?? null,
        intent: input.intent,
        files: input.files ?? [],
        sessionId: extra?.sessionId,
      });
      deps.logger.info(
        {
          event: 'start_work',
          room: input.room,
          work_id: entry.work_id,
          session_id: extra?.sessionId ?? null,
        },
        'work started',
      );
      return {
        content: [{ type: 'text', text: `Started work ${entry.work_id}` }],
        structuredContent: { work_id: entry.work_id, started_at: entry.started_at },
      };
    },
  );

  server.registerTool(
    'heartbeat',
    {
      title: 'Heartbeat an active work entry (deprecated)',
      description:
        '(optional, deprecated — presence is automatic when connected) Updates `last_seen` for the given `work_id`. New agents do not need to call this; the server keeps your entry alive as long as your MCP session is connected. Retained for legacy clients on the stateless transport path.',
      inputSchema: HeartbeatInputSchema.shape,
    },
    async (input) => {
      const room = repo.getRoom(input.room);
      if (!room) return toolErrorResult({ code: 'room_not_found', message: input.room });
      const state = registry.getOrCreate(input.room);
      const outcome = await state.heartbeat(input.work_id);
      if (outcome.status === 'ok') {
        return {
          content: [{ type: 'text', text: 'ok' }],
          structuredContent: { ok: true },
        };
      }
      return toolErrorResult({ code: 'work_not_found', message: input.work_id });
    },
  );

  server.registerTool(
    'complete_work',
    {
      title: 'Mark an active work entry complete',
      description:
        'Call this when you finish (or abandon) the unit of work you announced. Removes the entry from the active set and writes it to recently-shipped, with the optional `summary` shown to teammates.',
      inputSchema: CompleteWorkInputSchema.shape,
    },
    async (input) => {
      const room = repo.getRoom(input.room);
      if (!room) return toolErrorResult({ code: 'room_not_found', message: input.room });
      const state = registry.getOrCreate(input.room);
      const outcome = await state.completeWork(input.work_id, input.summary ?? null);
      if (outcome.status === 'completed') {
        deps.logger.info(
          { event: 'complete_work', room: input.room, work_id: input.work_id },
          'work completed',
        );
        return {
          content: [{ type: 'text', text: 'ok' }],
          structuredContent: { ok: true },
        };
      }
      if (outcome.status === 'already_completed') {
        return toolErrorResult({ code: 'work_already_completed', message: input.work_id });
      }
      return toolErrorResult({ code: 'work_not_found', message: input.work_id });
    },
  );

  server.registerTool(
    'list_active',
    {
      title: 'List active work entries in a room',
      description:
        'Optional read-only inspection — returns every currently active work entry in the room. Use when you want a full picture rather than just overlap with the caller.',
      inputSchema: ListActiveInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input) => {
      const room = repo.getRoom(input.room);
      if (!room) return toolErrorResult({ code: 'room_not_found', message: input.room });
      const state = registry.getOrCreate(input.room);
      const entries = state.listActive();
      return {
        content: [{ type: 'text', text: `${entries.length} active entries.` }],
        structuredContent: { entries },
      };
    },
  );

  return server;
}
