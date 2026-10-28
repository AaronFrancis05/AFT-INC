import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { dbEnv } from "./env";
import { PrismaClient } from "./generated/prisma/client";

// Model types only; `export type` keeps the generated runtime out of anything that imports them.
export type { Account, Session, User, Verification } from "./generated/prisma/client";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient;
};

const adapter = new PrismaPg({
  connectionString: dbEnv().DATABASE_URL,
});

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
