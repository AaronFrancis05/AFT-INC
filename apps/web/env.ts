// The web app's environment schema: exactly the slices it uses (spec 0010, AC-9).
// Rules only; the start check in instrumentation.ts and the env-schema exporter read it.
import { composeEnv, coreEnv } from "@aft/config/env";
import { authEnvSlice } from "@aft/auth/env";
import { dbEnvSlice } from "@aft/db/env";

export const webEnv = composeEnv("web", [coreEnv, dbEnvSlice, authEnvSlice]);
