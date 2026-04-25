function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be an integer, got ${raw}`);
  }
  return n;
}

function envStr(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

export interface AppConfig {
  port: number;
  dataDir: string;
  publicBaseUrl: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  historyLimit: number;
  rateLimitRoomsPerHour: number;
  rateLimitWritesPerMinute: number;
  heartbeatExpiryMs: number;
  sweepIntervalMs: number;
  demoBanner: boolean;
  corsOrigin: string;
  isProduction: boolean;
}

const VALID_LOG_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

export function loadConfig(): AppConfig {
  const logLevel = envStr('LOG_LEVEL', 'info');
  if (!VALID_LOG_LEVELS.has(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of ${[...VALID_LOG_LEVELS].join(', ')}`);
  }

  return {
    port: envInt('PORT', 8787),
    dataDir: envStr('DATA_DIR', './data'),
    publicBaseUrl: envStr('PUBLIC_BASE_URL', `http://localhost:${envInt('PORT', 8787)}`),
    logLevel: logLevel as AppConfig['logLevel'],
    historyLimit: envInt('HISTORY_LIMIT', 100),
    rateLimitRoomsPerHour: envInt('RATE_LIMIT_ROOMS_PER_HOUR', 10),
    rateLimitWritesPerMinute: envInt('RATE_LIMIT_WRITES_PER_MIN', 60),
    heartbeatExpiryMs: envInt('HEARTBEAT_EXPIRY_MS', 90_000),
    sweepIntervalMs: envInt('SWEEP_INTERVAL_MS', 15_000),
    demoBanner: envBool('DEMO_BANNER', false),
    corsOrigin: envStr('CORS_ORIGIN', 'http://localhost:5173'),
    isProduction: envStr('NODE_ENV', 'development') === 'production',
  };
}

export function describeConfig(cfg: AppConfig): Record<string, unknown> {
  return { ...cfg };
}
