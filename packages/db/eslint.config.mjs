import aftConfig, { allowRawPrisma } from "@aft/config/eslint";

// The database package owns the client (spec 0011, AC-18).
const config = [...aftConfig, ...allowRawPrisma(["src/**"])];

export default config;
