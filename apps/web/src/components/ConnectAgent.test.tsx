/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KNOWORK_PROTOCOL_TEXT } from '@apb/shared';
import {
  ConnectAgent,
  buildPrimaryCommand,
  buildClaudeCodeSnippet,
  buildCodexSnippet,
  buildCursorSnippet,
} from './ConnectAgent.js';

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  // jsdom doesn't ship navigator.clipboard; install a controllable mock.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});

const CODE = 'ABCDEFGHIJ';
const SERVER_URL = 'https://knowork.example/mcp';

describe('ConnectAgent', () => {
  it('copies the primary npx command exactly', async () => {
    render(<ConnectAgent code={CODE} serverUrl={SERVER_URL} />);

    fireEvent.click(screen.getByTestId('copy-primary'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(
      `npx knowork connect ${CODE} --server ${SERVER_URL}`,
    );
    expect(writeText).toHaveBeenCalledWith(buildPrimaryCommand(CODE, SERVER_URL));
  });

  it('copies the Claude Code JSON snippet', () => {
    render(<ConnectAgent code={CODE} serverUrl={SERVER_URL} />);

    fireEvent.click(screen.getByTestId('agent-claude-code'));
    fireEvent.click(screen.getByTestId('copy-snippet'));

    const expected = JSON.stringify(
      {
        mcpServers: {
          knowork: {
            type: 'http',
            url: SERVER_URL,
            headers: { 'X-Room-Code': CODE },
          },
        },
      },
      null,
      2,
    );
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(writeText).toHaveBeenCalledWith(buildClaudeCodeSnippet(CODE, SERVER_URL));
  });

  it('copies the Codex TOML snippet', () => {
    render(<ConnectAgent code={CODE} serverUrl={SERVER_URL} />);

    fireEvent.click(screen.getByTestId('agent-codex'));
    fireEvent.click(screen.getByTestId('copy-snippet'));

    const expected = `[[mcp_servers]]
name = "knowork"
transport = "http"
url = "${SERVER_URL}"

[mcp_servers.headers]
X-Room-Code = "${CODE}"
`;
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(writeText).toHaveBeenCalledWith(buildCodexSnippet(CODE, SERVER_URL));
  });

  it('copies the Cursor JSON snippet', () => {
    render(<ConnectAgent code={CODE} serverUrl={SERVER_URL} />);

    fireEvent.click(screen.getByTestId('agent-cursor'));
    fireEvent.click(screen.getByTestId('copy-snippet'));

    const expected = JSON.stringify(
      {
        mcpServers: {
          knowork: {
            type: 'http',
            url: SERVER_URL,
            headers: { 'X-Room-Code': CODE },
          },
        },
      },
      null,
      2,
    );
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(writeText).toHaveBeenCalledWith(buildCursorSnippet(CODE, SERVER_URL));
  });

  it('shows the manual paste note instead of a snippet', () => {
    render(<ConnectAgent code={CODE} serverUrl={SERVER_URL} />);

    fireEvent.click(screen.getByTestId('agent-manual'));
    expect(screen.getByTestId('manual-note')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-snippet')).toBeNull();
  });

  it('copies the rules paragraph constant exactly', () => {
    render(<ConnectAgent code={CODE} serverUrl={SERVER_URL} />);

    fireEvent.click(screen.getByTestId('copy-rules'));
    expect(writeText).toHaveBeenCalledWith(KNOWORK_PROTOCOL_TEXT);
  });

  it('reflects prop updates: re-rendered code/serverUrl drive the next copy', () => {
    const { rerender } = render(<ConnectAgent code={CODE} serverUrl={SERVER_URL} />);

    const NEW_CODE = 'ZYXWVUTSRQ';
    const NEW_SERVER = 'https://other.example/mcp';
    rerender(<ConnectAgent code={NEW_CODE} serverUrl={NEW_SERVER} />);

    // Primary command updates in the displayed text.
    expect(screen.getByTestId('primary-command').textContent).toBe(
      `npx knowork connect ${NEW_CODE} --server ${NEW_SERVER}`,
    );

    // Clipboard payload reflects the new props.
    fireEvent.click(screen.getByTestId('copy-primary'));
    expect(writeText).toHaveBeenLastCalledWith(
      `npx knowork connect ${NEW_CODE} --server ${NEW_SERVER}`,
    );

    // Agent snippet also reflects new props.
    fireEvent.click(screen.getByTestId('agent-claude-code'));
    fireEvent.click(screen.getByTestId('copy-snippet'));
    expect(writeText).toHaveBeenLastCalledWith(buildClaudeCodeSnippet(NEW_CODE, NEW_SERVER));
  });
});
