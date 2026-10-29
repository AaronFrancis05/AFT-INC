// The database's environment slice (spec 0010). Rules only, never values, and no
// server-only import, so the env-schema exporter can load it in plain Node.
import { createEnvAccessor, defineEnv } from "@aft/config/env";
import { z } from "zod";

function isPostgresUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}

export const dbEnvSlice = defineEnv({
  DATABASE_URL: {
    description:
      "Postgres connection string. Local: the dev database through the SSM port forward; production: Postgres on the server.",
    secret: true,
    required: "always",
    schema: z.string().refine(isPostgresUrl),
    message: "must be a postgres:// or postgresql:// URL",
  },
});

export const dbEnv = createEnvAccessor(dbEnvSlice);
