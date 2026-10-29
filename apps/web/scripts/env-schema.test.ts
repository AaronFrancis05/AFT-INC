// @vitest-environment node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "env-schema.mts");

// Runs the exporter the way the deploy does: plain Node, no TS runner, no variables set.
function runExporter(env: Record<string, string> = {}) {
  return execFileSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", SCRIPT],
    {
      encoding: "utf8",
      env: {
        // Next.js types make NODE_ENV a required key of a process env object.
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
        SYSTEMROOT: process.env.SYSTEMROOT ?? "",
        ...env,
      },
    },
  );
}

describe("env-schema exporter (spec 0010, AC-11)", () => {
  it("covers AC-11: prints only JSON for the web app with every variable, sorted, needing no env", () => {
    const schema = JSON.parse(runExporter()) as {
      app: string;
      variables: { name: string; secret: boolean; required: string; pair?: string }[];
    };
    const names = schema.variables.map((v) => v.name);

    expect(schema.app).toBe("web");
    expect(names).toEqual([...names].sort());
    expect(names).toEqual([
      "AFT_ENV",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "DATABASE_URL",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
    ]);
    expect(schema.variables.find((v) => v.name === "GOOGLE_CLIENT_SECRET")).toMatchObject({
      secret: true,
      required: "optional",
      pair: "GOOGLE_CLIENT_ID",
    });
  });

  it("covers AC-11: never contains a value, even when every variable is set", () => {
    const output = runExporter({
      AFT_ENV: "production",
      DATABASE_URL: "postgresql://u:zz-sentinel-db@h/db",
      BETTER_AUTH_SECRET: "zz-sentinel-secret-0123456789abcdefghij",
      RESEND_API_KEY: "re_zz-sentinel-key",
    });
    expect(output).not.toContain("zz-sentinel");
  });
});
