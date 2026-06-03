import type { AppConfig } from "../config/index.js";

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers['x-api-key']",
  "req.headers['X-Api-Key']",
];

/** Pino options compatible with Fastify's `logger` config */
export function fastifyLoggerOptions(config: AppConfig) {
  return {
    level: config.logLevel,
    redact: {
      paths: REDACT_PATHS,
      remove: true,
    },
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
    base: undefined,
    timestamp: true,
  };
}
