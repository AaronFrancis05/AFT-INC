// Next.js calls register() once per server start, before serving any request.
// It checks the whole web env schema and stops the server on any problem (spec 0010, AC-1).
export async function register() {
  // Only the Node.js server; imports stay inside the branch so the Edge bundle never sees process.exit.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // The image is built once and gets its env at runtime, so next build never runs the check (AC-10, I50).
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { checkEnvOrExit } = await import("@aft/config/env");
  const { webEnv } = await import("./env");
  checkEnvOrExit(webEnv);
}
