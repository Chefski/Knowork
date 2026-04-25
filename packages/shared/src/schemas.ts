import { z } from 'zod';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;

export const AgentIdentitySchema = z.object({
  name: z.string().min(1).max(120),
  tool: z.string().min(1).max(60),
});

export const RoomCodeSchema = z
  .string()
  .length(6)
  .regex(ROOM_CODE_PATTERN, 'Room code must use base32 alphabet (A-Z, 2-9, no 0/O/1/I/L)');

export const StartWorkInputSchema = z.object({
  room: RoomCodeSchema,
  agent_identity: AgentIdentitySchema,
  repo: z.string().min(1).max(200),
  branch: z.string().min(1).max(200).nullable().optional(),
  intent: z.string().min(1).max(2000),
  files: z.array(z.string().min(1).max(500)).max(200).optional(),
});

export const HeartbeatInputSchema = z.object({
  room: RoomCodeSchema,
  work_id: z.string().min(1),
});

export const CompleteWorkInputSchema = z.object({
  room: RoomCodeSchema,
  work_id: z.string().min(1),
  summary: z.string().max(2000).optional(),
});

export const CheckOverlapInputSchema = z.object({
  room: RoomCodeSchema,
  repo: z.string().min(1).max(200),
  intent: z.string().min(1).max(2000).optional(),
  files: z.array(z.string().min(1).max(500)).max(200).optional(),
  branch: z.string().min(1).max(200).optional(),
});

export const ListActiveInputSchema = z.object({
  room: RoomCodeSchema,
});

export type StartWorkInput = z.infer<typeof StartWorkInputSchema>;
export type HeartbeatInput = z.infer<typeof HeartbeatInputSchema>;
export type CompleteWorkInput = z.infer<typeof CompleteWorkInputSchema>;
export type CheckOverlapInput = z.infer<typeof CheckOverlapInputSchema>;
export type ListActiveInput = z.infer<typeof ListActiveInputSchema>;
