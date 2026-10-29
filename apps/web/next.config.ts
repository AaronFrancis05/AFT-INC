import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// The one .env lives at the repo root (spec 0008, AC-13); a missing file is not an error.
// Next.js has already loaded (and cached) env files from apps/web by the time this runs,
// so forceReload is needed for the root files to replace that empty result.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next.js compiles them (AC-17).
  transpilePackages: ["@aft/auth", "@aft/config", "@aft/db", "@aft/email", "@aft/ui"],
  // Both point at the repo root, so Next.js sees one workspace and traces package files (AC-17).
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
