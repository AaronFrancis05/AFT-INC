import "server-only";
import { aftEnv, type Tier } from "@aft/config/env";
import { pino, type DestinationStream, type Logger as PinoLogger } from "pino";
import { logEnv, type LogLevel } from "./env";

export type Logger = PinoLogger;

// Keys whose values never reach a log line, at the top level and one level down (AC-12, X29).
// Log ids, never people: names, query strings, and whole bodies are kept out by the standard.
export const REDACT_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "secret",
  "clientSecret",
  "apiKey",
  "authorization",
  "cookie",
  "otp",
  "email",
  "ip",
  "ipAddress",
] as const;

const REDACT_PATHS = REDACT_KEYS.flatMap((key) => [key, `*.${key}`]);

const DEFAULT_LEVEL: Readonly<Record<Tier, LogLevel>> = {
  development: "debug",
  production: "info",
  test: "silent",
};

export type LoggerOptions = {
  // The app or service writing the lines, for example "web".
  service: string;
  // Tests pass a stream to read the lines back; otherwise stdout.
  destination?: DestinationStream;
  // Overrides LOG_LEVEL and the tier default (tests).
  level?: LogLevel;
};

function buildLogger({ service, destination, level }: LoggerOptions): Logger {
  const env = aftEnv();
  const options = {
    level: level ?? logEnv().LOG_LEVEL ?? DEFAULT_LEVEL[env],
    // No pid or hostname: one container per service, and the host is not useful in a line.
    base: { service, env },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label: string) => ({ level: label }) },
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  };
  // pino's default destination writes to stdout synchronously: no transports, no worker threads.
  return destination ? pino(options, destination) : pino(options);
}

// The logger is built on first use, so importing a module that makes one reads no env (AC-12).
export function createLogger(options: LoggerOptions): Logger {
  let instance: Logger | undefined;
  const get = () => (instance ??= buildLogger(options));
  return new Proxy({} as Logger, {
    get(_target, property) {
      const logger = get();
      const value: unknown = Reflect.get(logger, property, logger);
      return typeof value === "function" ? (value as () => unknown).bind(logger) : value;
    },
    set(_target, property, value) {
      return Reflect.set(get(), property, value);
    },
  });
}
