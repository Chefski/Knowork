import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../db/sqlite.js';
import { runMigrations } from '../db/migrate.js';
import { Repository } from '../db/repository.js';
import { RoomState } from './room-state.js';

const ROOM = 'OVERLP';

describe('RoomState.checkOverlap', () => {
  let db: Db;
  let state: RoomState;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    runMigrations(db);
    const repo = new Repository(db);
    repo.createRoom(ROOM);
    state = new RoomState(ROOM, repo);
    await state.startWork({
      agentIdentity: { name: 'Alice', tool: 'Claude Code' },
      repo: 'org/payments',
      branch: 'feat/auth',
      intent: 'refactor payment authentication module',
      files: ['src/payments/auth.ts'],
    });
  });
  afterEach(() => db.close());

  it('matches same repo + similar intent', () => {
    const matches = state.checkOverlap({
      repo: 'org/payments',
      intent: 'refactor authentication payment flow',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reason).toMatch(/intent keywords/);
  });

  it('does not match different repo', () => {
    const matches = state.checkOverlap({
      repo: 'org/billing',
      intent: 'refactor payment authentication module',
    });
    expect(matches).toHaveLength(0);
  });

  it('matches case-insensitively on repo', () => {
    const matches = state.checkOverlap({
      repo: 'ORG/Payments',
      intent: 'refactor payment authentication',
    });
    expect(matches).toHaveLength(1);
  });

  it('matches on overlapping files', () => {
    const matches = state.checkOverlap({
      repo: 'org/payments',
      files: ['src/payments/auth.ts'],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reason).toMatch(/overlapping file/);
  });

  it('matches on same branch', () => {
    const matches = state.checkOverlap({
      repo: 'org/payments',
      branch: 'feat/auth',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reason).toMatch(/same branch/);
  });

  it('matches on substring branch overlap', () => {
    const matches = state.checkOverlap({
      repo: 'org/payments',
      branch: 'feat/auth-cleanup',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reason).toMatch(/same branch/);
  });

  it('matches on related (token-overlapping) file paths', () => {
    const matches = state.checkOverlap({
      repo: 'org/payments',
      files: ['src/payments/auth.test.ts'],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reason).toMatch(/related file/);
  });

  it('returns same-repo signal even when no other dimensions match', () => {
    const matches = state.checkOverlap({
      repo: 'org/payments',
      intent: 'fix typo in readme',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reason).toMatch(/same repo/);
  });
});
