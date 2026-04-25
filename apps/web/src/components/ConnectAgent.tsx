import { useEffect, useRef, useState } from 'react';
import { KNOWORK_PROTOCOL_TEXT } from '@apb/shared';

type AgentId = 'claude-code' | 'codex' | 'cursor' | 'manual';

interface AgentOption {
  id: AgentId;
  label: string;
}

const AGENTS: AgentOption[] = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'manual', label: 'Manual' },
];

export function buildPrimaryCommand(code: string, serverUrl: string): string {
  return `npx knowork connect ${code} --server ${serverUrl}`;
}

export function buildClaudeCodeSnippet(code: string, serverUrl: string): string {
  const config = {
    mcpServers: {
      knowork: {
        type: 'http',
        url: serverUrl,
        headers: { 'X-Room-Code': code },
      },
    },
  };
  return JSON.stringify(config, null, 2);
}

export function buildCursorSnippet(code: string, serverUrl: string): string {
  return buildClaudeCodeSnippet(code, serverUrl);
}

export function buildCodexSnippet(code: string, serverUrl: string): string {
  return `[[mcp_servers]]
name = "knowork"
transport = "http"
url = "${serverUrl}"

[mcp_servers.headers]
X-Room-Code = "${code}"
`;
}

function snippetForAgent(agent: AgentId, code: string, serverUrl: string): string | null {
  switch (agent) {
    case 'claude-code':
      return buildClaudeCodeSnippet(code, serverUrl);
    case 'codex':
      return buildCodexSnippet(code, serverUrl);
    case 'cursor':
      return buildCursorSnippet(code, serverUrl);
    case 'manual':
      return null;
  }
}

interface CopyButtonProps {
  text: string;
  label?: string;
  testId?: string;
}

function CopyButton({ text, label = 'Copy', testId }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (insecure context / denied permission) — leave state unchanged
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      data-testid={testId}
      className="rounded border border-ink-200 px-2 py-1 text-xs hover:bg-ink-100"
    >
      {copied ? 'copied' : label}
    </button>
  );
}

interface ConnectAgentProps {
  code: string;
  serverUrl: string;
  onClose?: () => void;
}

export function ConnectAgent({ code, serverUrl, onClose }: ConnectAgentProps) {
  const [agent, setAgent] = useState<AgentId>('claude-code');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click and Escape so the popover behaves like the rest of the header.
  useEffect(() => {
    if (!onClose) return;
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      onClose?.();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const primary = buildPrimaryCommand(code, serverUrl);
  const snippet = snippetForAgent(agent, code, serverUrl);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Connect agent"
      data-testid="connect-agent-popover"
      className="absolute right-0 top-full z-20 mt-2 w-[28rem] max-w-[90vw] rounded-lg border border-ink-200 bg-white p-4 shadow-lg"
    >
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          One-command connect
        </h3>
        <div className="flex items-start gap-2">
          <pre
            data-testid="primary-command"
            className="flex-1 overflow-x-auto rounded border border-ink-200 bg-ink-100 px-2 py-1.5 font-mono text-xs text-ink-800"
          >
            {primary}
          </pre>
          <CopyButton text={primary} testId="copy-primary" />
        </div>
      </section>

      <section className="mt-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          Or pick your agent
        </h3>
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-ink-200 p-1">
          {AGENTS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`agent-${opt.id}`}
              onClick={() => setAgent(opt.id)}
              className={
                'rounded px-2 py-1 text-xs transition ' +
                (agent === opt.id
                  ? 'bg-ink-900 text-white'
                  : 'bg-white text-ink-600 hover:bg-ink-100')
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        {snippet ? (
          <div className="flex items-start gap-2">
            <pre
              data-testid="agent-snippet"
              className="flex-1 max-h-48 overflow-auto rounded border border-ink-200 bg-ink-100 px-2 py-1.5 font-mono text-xs text-ink-800"
            >
              {snippet}
            </pre>
            <CopyButton text={snippet} testId="copy-snippet" />
          </div>
        ) : (
          <p data-testid="manual-note" className="text-xs text-ink-600">
            Just paste the rules paragraph below into your agent's rules file.
          </p>
        )}
      </section>

      <section className="mt-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          Rules paragraph (CLAUDE.md / AGENTS.md)
        </h3>
        <div className="flex items-start gap-2">
          <pre
            data-testid="rules-paragraph"
            className="flex-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-ink-200 bg-ink-100 px-2 py-1.5 font-mono text-xs text-ink-800"
          >
            {KNOWORK_PROTOCOL_TEXT}
          </pre>
          <CopyButton text={KNOWORK_PROTOCOL_TEXT} testId="copy-rules" />
        </div>
      </section>

      <p className="mt-4 text-xs text-ink-400">After installing, restart your agent.</p>
    </div>
  );
}
