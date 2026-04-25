import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CheckOverlapInputSchema,
  CompleteWorkInputSchema,
  HeartbeatInputSchema,
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

  const server = new McpServer({
    name: 'agent-presence-board',
    version: '0.1.0',
  });

  server.registerTool(
    'check_overlap',
    {
      title: 'Check overlap with active work in this room',
      description:
        'Returns active work entries in the room whose repo, branch, intent keywords, or files overlap with the caller. Advisory only — does not block start_work.',
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
      description: 'Registers a new active entry in the room and returns a work_id.',
      inputSchema: StartWorkInputSchema.shape,
    },
    async (input) => {
      const room = repo.getRoom(input.room);
      if (!room) return toolErrorResult({ code: 'room_not_found', message: input.room });
      const state = registry.getOrCreate(input.room);
      const entry = await state.startWork({
        agentIdentity: input.agent_identity,
        repo: input.repo,
        branch: input.branch ?? null,
        intent: input.intent,
        files: input.files ?? [],
      });
      deps.logger.info(
        { event: 'start_work', room: input.room, work_id: entry.work_id },
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
      title: 'Heartbeat an active work entry',
      description: 'Updates last_seen for the given work_id so the entry does not expire.',
      inputSchema: HeartbeatInputSchema.shape,
    },
    async (input) => {
      for (const room of allRooms(registry)) {
        const outcome = await room.heartbeat(input.work_id);
        if (outcome.status === 'ok') {
          return {
            content: [{ type: 'text', text: 'ok' }],
            structuredContent: { ok: true },
          };
        }
      }
      return toolErrorResult({ code: 'work_not_found', message: input.work_id });
    },
  );

  server.registerTool(
    'complete_work',
    {
      title: 'Mark an active work entry complete',
      description: 'Removes the entry from the active set and writes it to recently-shipped.',
      inputSchema: CompleteWorkInputSchema.shape,
    },
    async (input) => {
      for (const room of allRooms(registry)) {
        const outcome = await room.completeWork(input.work_id, input.summary ?? null);
        if (outcome.status === 'completed') {
          deps.logger.info(
            { event: 'complete_work', work_id: input.work_id },
            'work completed',
          );
          return {
            content: [{ type: 'text', text: 'ok' }],
            structuredContent: { ok: true },
          };
        }
      }
      return toolErrorResult({ code: 'work_not_found', message: input.work_id });
    },
  );

  server.registerTool(
    'list_active',
    {
      title: 'List active work entries in a room',
      description: 'Returns all currently active work entries.',
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

function allRooms(registry: RoomRegistry) {
  const out: Array<ReturnType<RoomRegistry['get']>> = [];
  registry.forEach((r) => out.push(r));
  return out.filter((r): r is NonNullable<typeof r> => Boolean(r));
}
