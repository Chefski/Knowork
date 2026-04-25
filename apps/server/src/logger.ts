import pino from 'pino';
import type { AppConfig } from './config.js';

export type Logger = pino.Logger;

export function createLogger(cfg: AppConfig): Logger {
  return pino({
    level: cfg.logLevel,
    base: { service: 'agent-presence-board' },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      remove: true,
    },
  });
}
