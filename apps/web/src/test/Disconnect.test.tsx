/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ActiveEntry, CompletedEntry } from '@apb/shared';
import { EntryCard } from '../components/EntryCard.js';
import { CompletedCard } from '../components/CompletedCard.js';
import { useRoomStore } from '../store.js';

function activeEntry(over: Partial<ActiveEntry> = {}): ActiveEntry {
  const t = Date.now();
  return {
    work_id: 'w1',
    agent_identity: { name: 'Alice', tool: 'Claude Code' },
    tool: 'Claude Code',
    repo: 'org/repo',
    branch: 'main',
    intent: 'do a thing',
    files: [],
    started_at: t,
    last_seen: t,
    disconnected_at: null,
    ...over,
  };
}

function completedEntry(reason: CompletedEntry['completion_reason']): CompletedEntry {
  const t = Date.now();
  return {
    id: 1,
    room_code: 'ROOMABCD23',
    work_id: 'w1',
    agent_identity: { name: 'Alice', tool: 'Claude Code' },
    tool: 'Claude Code',
    repo: 'org/repo',
    branch: 'main',
    intent: 'do a thing',
    files: [],
    started_at: t - 1000,
    completed_at: t,
    completion_reason: reason,
    summary: null,
  };
}

describe('EntryCard', () => {
  it('renders disconnected entries with a reconnecting indicator', () => {
    render(<EntryCard entry={activeEntry({ disconnected_at: Date.now() })} />);
    const card = screen.getByTestId('entry-card');
    expect(card.dataset.disconnected).toBe('true');
    expect(screen.getByTestId('reconnecting-indicator')).toHaveTextContent(/reconnecting/i);
  });

  it('does not render the reconnecting indicator for live entries', () => {
    render(<EntryCard entry={activeEntry({ disconnected_at: null })} />);
    const card = screen.getByTestId('entry-card');
    expect(card.dataset.disconnected).toBeUndefined();
    expect(screen.queryByTestId('reconnecting-indicator')).toBeNull();
  });
});

describe('CompletedCard', () => {
  it('shows "session closed" for session_closed completions', () => {
    render(<CompletedCard entry={completedEntry('session_closed')} />);
    expect(screen.getByText(/session closed/i)).toBeInTheDocument();
  });

  it('shows "max age" for session_max_age completions', () => {
    render(<CompletedCard entry={completedEntry('session_max_age')} />);
    expect(screen.getByText(/max age/i)).toBeInTheDocument();
  });

  it('still shows "shipped" for normal completions', () => {
    render(<CompletedCard entry={completedEntry('completed')} />);
    expect(screen.getByText(/shipped/i)).toBeInTheDocument();
  });
});

describe('useRoomStore disconnect/resume', () => {
  it('disconnectEntry sets disconnected_at on the matching entry', () => {
    const store = useRoomStore.getState();
    store.setSnapshot([activeEntry()], []);

    useRoomStore.getState().disconnectEntry('w1', 12345);
    expect(useRoomStore.getState().active[0]!.disconnected_at).toBe(12345);
  });

  it('resumeEntry clears disconnected_at', () => {
    const store = useRoomStore.getState();
    store.setSnapshot([activeEntry({ disconnected_at: 12345 })], []);

    useRoomStore.getState().resumeEntry('w1');
    expect(useRoomStore.getState().active[0]!.disconnected_at).toBeNull();
  });
});
