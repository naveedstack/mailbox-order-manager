export type Logger = Pick<Console, "info" | "warn" | "error">;

export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  return {
    info: (...args) => console.info(new Date().toISOString(), prefix, ...args),
    warn: (...args) => console.warn(new Date().toISOString(), prefix, ...args),
    error: (...args) => console.error(new Date().toISOString(), prefix, ...args),
  };
}
