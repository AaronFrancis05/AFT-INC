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
  eslint = new ESLint({
    cwd: appDir,
    // The probe file is not on disk, so no tsconfig includes it (I41). The boundary rule needs no
    // type information, so the type aware rules from spec 0009 are off for this probe only.
    overrideConfig: {
      files: [
        "components/probe.tsx",
        "scripts/probe.ts",
        "lib/probe.ts",
        "lib/repositories/probe.ts",
        "lib/probe.test.ts",
      ],
      languageOptions: { parserOptions: { projectService: false } },
      rules: {
        "@typescript-eslint/no-floating-promises": "off",
        "@typescript-eslint/no-misused-promises": "off",
      },
    },
  });
  await eslint.lintText("export {};\n", { filePath: path.join(appDir, "components", "probe.tsx") });
}, 120_000);

// Messages from the boundary and env rules only, so unrelated rules (unused vars and so on) never
// mask a result. The probe is a component file unless a path inside the app is given.
async function restricted(code: string, probe = path.join("components", "probe.tsx")) {
  const [result] = await eslint.lintText(code, { filePath: path.join(appDir, probe) });
  if (!result) throw new Error("ESLint returned no result for the snippet");
  return result.messages.filter(
    (m) => m.ruleId === "no-restricted-imports" || m.ruleId === "no-restricted-syntax",
  );
}

describe("package boundary rule (spec 0008 AC-11)", () => {
  it("rejects a deep import into a package's src folder", async () => {
    const messages = await restricted(
      `import { auth } from "@aft/auth/src/server/auth";\nexport { auth };\n`,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
    expect(messages[0]?.message).toContain("never its src folder");
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
    expect(messages[0]?.message).toContain("Nothing imports the app");
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
    expect(messages[0]?.message).toContain("@aft/ui/lib/utils");
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

describe("process.env rule (spec 0010 AC-13)", () => {
  it.each([
    ["a named read", "export const key = process.env.RESEND_API_KEY;\n"],
    ["a computed read", 'export const key = process.env["RESEND_API_KEY"];\n'],
    ["a dynamic read", 'const name = "X";\nexport const key = process.env[name];\n'],
    ["the whole object", "export function read(env = process.env) {\n  return env;\n}\n"],
    ["destructuring", "const { env } = process;\nexport { env };\n"],
    ["importing env from node:process", 'import { env } from "node:process";\nexport { env };\n'],
    ["importing env from process", 'import { env } from "process";\nexport { env };\n'],
  ])("I53: rejects %s outside the env modules", async (_form, code) => {
    const messages = await restricted(code);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
    expect(messages[0]?.message).toContain("@aft/<pkg>/env");
  });

  it.each(["NODE_ENV", "NEXT_RUNTIME", "NEXT_PHASE"])(
    "allows process.env.%s, which Next.js sets itself",
    async (name) => {
      expect(await restricted(`export const value = process.env.${name};\n`)).toEqual([]);
    },
  );

  it("allows any read in scripts, which run outside the app", async () => {
    const code = "export const key = process.env.RESEND_API_KEY;\n";
    expect(await restricted(code, path.join("scripts", "probe.ts"))).toEqual([]);
  });

  it("keeps the package boundary rule in the files that may read variables", async () => {
    const code = `import { auth } from "@aft/auth/src/server/auth";\nexport { auth };\n`;
    const messages = await restricted(code, path.join("scripts", "probe.ts"));
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("never its src folder");
  });
});

// Messages from one rule, for the spec 0011 rules.
async function ruleMessages(rule: string, code: string, probe: string) {
  const [result] = await eslint.lintText(code, { filePath: path.join(appDir, probe) });
  if (!result) throw new Error("ESLint returned no result for the snippet");
  return result.messages.filter((m) => m.ruleId === rule);
}

describe("no-console (spec 0011 AC-18)", () => {
  it.each(["log", "warn", "error", "info", "debug"])(
    "rejects console.%s in server code",
    async (level) => {
      const messages = await ruleMessages(
        "no-console",
        `console.${level}("x");
`,
        "lib/probe.ts",
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]?.severity).toBe(2);
    },
  );

  it("components may use console.error only, until feature 23", async () => {
    const probe = path.join("components", "probe.tsx");
    expect(
      await ruleMessages(
        "no-console",
        `console.error("x");
`,
        probe,
      ),
    ).toEqual([]);
    expect(
      await ruleMessages(
        "no-console",
        `console.log("x");
`,
        probe,
      ),
    ).toHaveLength(1);
  });

  it.each([path.join("scripts", "probe.ts"), path.join("lib", "probe.test.ts")])(
    "allows console in %s",
    async (probe) => {
      expect(
        await ruleMessages(
          "no-console",
          `console.log("x");
`,
          probe,
        ),
      ).toEqual([]);
    },
  );
});

describe("raw Prisma client rule (spec 0011 AC-18)", () => {
  const rawImport = `import prisma from "@aft/db";
export { prisma };
`;

  it.each([path.join("lib", "probe.ts"), path.join("scripts", "probe.ts")])(
    "rejects the default @aft/db import in %s",
    async (probe) => {
      const messages = await ruleMessages("no-restricted-imports", rawImport, probe);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.message).toContain("repository");
    },
  );

  it("allows it in repositories and tests", async () => {
    for (const probe of [
      path.join("lib", "repositories", "probe.ts"),
      path.join("lib", "probe.test.ts"),
    ])
      expect(await ruleMessages("no-restricted-imports", rawImport, probe), probe).toEqual([]);
  });

  it("allows the type exports, and repositories keep the env rule", async () => {
    const types = `import type { User } from "@aft/db";
export type { User };
`;
    expect(await ruleMessages("no-restricted-imports", types, "lib/probe.ts")).toEqual([]);
    const env = `import { env } from "node:process";
export { env };
`;
    const probe = path.join("lib", "repositories", "probe.ts");
    expect(await ruleMessages("no-restricted-imports", env, probe)).toHaveLength(1);
  });
});
