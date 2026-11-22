type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'HTTP';

function formatLine(level: LogLevel, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level}] ${message}`;
  if (meta !== undefined) {
    try {
      return `${base} ${JSON.stringify(meta)}`;
    } catch {
      return base;
    }
  }
  return base;
}

export const logger = {
  info: (message: string, meta?: unknown) => {
    console.log(formatLine('INFO', message, meta));
  },
  warn: (message: string, meta?: unknown) => {
    console.warn(formatLine('WARN', message, meta));
  },
  error: (message: string, meta?: unknown) => {
    console.error(formatLine('ERROR', message, meta));
  },
  http: (method: string, path: string, status: number, durationMs: number) => {
    console.log(formatLine('HTTP', `${method} ${path} -> ${status} (${durationMs}ms)`));
  },
};
