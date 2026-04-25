import { describe, expect, it } from 'vitest';
import {
  CheckOverlapInputSchema,
  CompleteWorkInputSchema,
  HeartbeatInputSchema,
  ListActiveInputSchema,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_PATTERN,
  RoomCodeSchema,
  StartWorkInputSchema,
} from './schemas.js';

describe('shared schemas', () => {
  it('accepts valid room code and rejects invalid alphabet or length', () => {
    expect(RoomCodeSchema.parse('ABC23456DE')).toBe('ABC23456DE');
    expect(() => RoomCodeSchema.parse('AB0I345678')).toThrow();
    expect(() => RoomCodeSchema.parse('SHORT')).toThrow();
    expect(() => RoomCodeSchema.parse('ABC234')).toThrow();
    expect(() => RoomCodeSchema.parse('ABC23456D')).toThrow();
    expect(() => RoomCodeSchema.parse('ABC23456DEF')).toThrow();
  });

  it('keeps alphabet and regex in sync', () => {
    for (const char of ROOM_CODE_ALPHABET) {
      expect(ROOM_CODE_PATTERN.test(char)).toBe(true);
    }
    expect(ROOM_CODE_PATTERN.test('0')).toBe(false);
    expect(ROOM_CODE_PATTERN.test('1')).toBe(false);
    expect(ROOM_CODE_PATTERN.test('O')).toBe(false);
    expect(ROOM_CODE_PATTERN.test('I')).toBe(false);
    expect(ROOM_CODE_PATTERN.test('L')).toBe(false);
  });

  it('validates start_work payload boundaries', () => {
    expect(
      StartWorkInputSchema.parse({
        room: 'ABC23456DE',
        agent_identity: { name: 'Agent', tool: 'Codex' },
        repo: 'org/repo',
        branch: null,
        intent: 'Ship feature',
        files: ['src/index.ts'],
      }),
    ).toMatchObject({ room: 'ABC23456DE', repo: 'org/repo' });

    expect(() =>
      StartWorkInputSchema.parse({
        room: 'ABC23456DE',
        agent_identity: { name: '', tool: 'Codex' },
        repo: 'org/repo',
        intent: 'x',
      }),
    ).toThrow();

    expect(() =>
      StartWorkInputSchema.parse({
        room: 'ABC23456DE',
        agent_identity: { name: 'Agent', tool: 'Codex' },
        repo: 'org/repo',
        intent: '',
      }),
    ).toThrow();

    expect(() =>
      StartWorkInputSchema.parse({
        room: 'ABC23456DE',
        agent_identity: { name: 'Agent', tool: 'Codex' },
        repo: 'org/repo',
        intent: 'x',
        files: Array.from({ length: 201 }, (_, i) => `f-${i}`),
      }),
    ).toThrow();
  });

  it('validates heartbeat, complete, overlap, and list_active payloads', () => {
    expect(
      HeartbeatInputSchema.parse({ room: 'ABC23456DE', work_id: 'wid-1' }),
    ).toMatchObject({ work_id: 'wid-1' });
    expect(() => HeartbeatInputSchema.parse({ room: 'ABC23456DE', work_id: '' })).toThrow();

    expect(
      CompleteWorkInputSchema.parse({ room: 'ABC23456DE', work_id: 'wid-1', summary: 'done' }),
    ).toMatchObject({ work_id: 'wid-1' });
    expect(() => CompleteWorkInputSchema.parse({ room: 'ABC23456DE', work_id: '' })).toThrow();

    expect(
      CheckOverlapInputSchema.parse({
        room: 'ABC23456DE',
        repo: 'org/repo',
        intent: 'refactor auth flow',
        files: ['src/auth.ts'],
        branch: 'feat/auth',
      }),
    ).toMatchObject({ repo: 'org/repo' });
    expect(() => CheckOverlapInputSchema.parse({ room: 'ABC23456DE', repo: '' })).toThrow();

    expect(ListActiveInputSchema.parse({ room: 'ABC23456DE' })).toMatchObject({
      room: 'ABC23456DE',
    });
    expect(() => ListActiveInputSchema.parse({ room: 'bad' })).toThrow();
  });
});
