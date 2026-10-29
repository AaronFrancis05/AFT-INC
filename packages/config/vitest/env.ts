// Every Vitest run is the test tier (spec 0010). Assigned directly, not with vi.stubEnv,
// so a test's vi.unstubAllEnvs() can't remove it.
process.env.AFT_ENV = "test";
