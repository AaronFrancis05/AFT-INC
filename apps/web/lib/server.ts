import "server-only";
import { allowedOrigins, sessionContextResolver } from "@aft/auth/context";
import { createLogger } from "@aft/core/log";
import { createActionWrapper, createRouteWrapper } from "@aft/core/server";
import { prismaErrorMapper } from "@aft/db/errors";
import { createIdempotencyStore } from "@aft/db/idempotency";
import { transactionRunner } from "@aft/db/tenant";

// The one place the web app wires the standard (spec 0011): every server action is a defineAction
// and every /api/v1 route a defineRoute. Each piece loads lazily, so importing this reads no env.

export const logger = createLogger({ service: "web" });

const shared = {
  logger,
  resolver: sessionContextResolver,
  store: createIdempotencyStore(),
  transactions: transactionRunner,
  errorMappers: [prismaErrorMapper],
};

export const defineAction = createActionWrapper(shared);

export const defineRoute = createRouteWrapper({ ...shared, allowedOrigins });
