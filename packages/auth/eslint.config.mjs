import aftConfig, { allowRawPrisma } from "@aft/config/eslint";

// Better Auth's Prisma adapter takes the client itself (spec 0011, AC-18).
const config = [...aftConfig, ...allowRawPrisma(["src/server/auth.ts"])];

export default config;
