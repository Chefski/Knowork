import type { ServerEvent } from '@apb/shared';

export interface Subscriber {
  id: string;
  send(payload: ServerEvent): void;
  close(): void;
}
