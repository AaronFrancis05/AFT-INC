// The logging environment slice (spec 0011, AC-21). Rules only, never values, and no server-only
// import, so the env-schema exporter can load it in plain Node.
import { createEnvAccessor, defineEnv } from "@aft/config/env";
import { z } from "zod";

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const logEnvSlice = defineEnv({
  LOG_LEVEL: {
    description:
      "Optional log level. Defaults to debug in development, info in production, silent in test.",
    secret: false,
    required: "optional",
    schema: z.enum(LOG_LEVELS),
    message: "one of fatal, error, warn, info, debug, trace, silent",
  },
});

export const logEnv = createEnvAccessor(logEnvSlice);
