// @vitest-environment node
// Lints small snippets with the app's real flat config (which spreads @aft/config/eslint), so the
// package boundary rules from spec 0008 stay enforced where code is actually written.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const appDir = path.dirname(fileURLToPath(import.meta.url));
let eslint: ESLint;

// The first lint loads the whole Next.js config (about 5 seconds alone), so do it once here. The
// 120 second limit leaves room for a loaded machine; it is a limit, not a retry (spec 0008, AC-20).
beforeAll(async () => {
  eslint = new ESLint({ cwd: appDir });
  await eslint.lintText("export {};\n", { filePath: path.join(appDir, "components", "probe.tsx") });
}, 120_000);

// Messages from the boundary rule only, so unrelated rules (unused vars and so on) never mask a result.
async function restricted(code: string) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(appDir, "components", "probe.tsx"),
  });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

describe("package boundary rule (spec 0008 AC-11)", () => {
  it("rejects a deep import into a package's src folder", async () => {
    const messages = await restricted(
      `import { auth } from "@aft/auth/src/server/auth";\nexport { auth };\n`,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].severity).toBe(2);
    expect(messages[0].message).toContain("never its src folder");
  });

  it("rejects an import of a package's bare src folder", async () => {
    const messages = await restricted(`import * as db from "@aft/db/src";\nexport { db };\n`);
    expect(messages).toHaveLength(1);
  });

  it("rejects importing the app from anywhere", async () => {
    const messages = await restricted(
      `import { Nav } from "@aft/app-web/components/nav/nav";\nexport { Nav };\n`,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain("Nothing imports the app");
  });

  it("allows imports through each package's exports map", async () => {
    const code = [
      `import { auth } from "@aft/auth/server";`,
      `import type { SocialProvider } from "@aft/auth/providers";`,
      `import { Button } from "@aft/ui/components/button";`,
      `import { cn } from "@aft/ui/lib/utils";`,
      `export type { SocialProvider };`,
      `export { auth, Button, cn };`,
    ].join("\n");
    expect(await restricted(code)).toEqual([]);
  });
});

describe("cn package guard (spec 0008 I29)", () => {
  it("rejects a value import of the cn package and points to @aft/ui/lib/utils", async () => {
    const messages = await restricted(`import { cn } from "cn";\nexport { cn };\n`);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain("@aft/ui/lib/utils");
  });

  it("rejects a type only import of the cn package", async () => {
    const messages = await restricted(
      `import type { ClassValue } from "cn";\nexport type { ClassValue };\n`,
    );
    expect(messages).toHaveLength(1);
  });

  it("rejects an import of the cn package split over several lines", async () => {
    const messages = await restricted(`import {\n  cn,\n} from "cn";\nexport { cn };\n`);
    expect(messages).toHaveLength(1);
  });

  it("rejects a re-export from the cn package", async () => {
    const messages = await restricted(`export { cn } from "cn";\n`);
    expect(messages).toHaveLength(1);
  });

  it("does not catch packages whose names only start with cn", async () => {
    const messages = await restricted(`import { x } from "cnx";\nexport { x };\n`);
    expect(messages).toEqual([]);
  });
});
