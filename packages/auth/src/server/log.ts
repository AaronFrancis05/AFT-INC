import "server-only";
import { createLogger } from "@aft/core/log";

// The auth package's logger (spec 0011): JSON lines, ids only, created on first use.
export const log = createLogger({ service: "auth" });
