// Typed environment config (spec 0010). Each package declares its variables as a slice,
// each app composes the slices it uses, and the app checks the whole list once at start.
//
// This file must stay loadable by plain Node 24 type stripping (the env-schema exporter):
// one file, no relative imports, erasable TypeScript only, `import type` for types.
import { z } from "zod";

export type Tier = "development" | "test" | "production";

// Returns the rule text when the value is refused, else null.
export type Check = (value: string, tier: Tier) => string | null;

export type VariableSpec = {
  description: string;
  secret: boolean;
  required: "always" | "production" | "optional";
  // Validates a present, trimmed value; `message` is the fixed rule text shown when it fails.
  // Never show zod's own issue text: some issues include the received value (AC-2, I49).
  schema: z.ZodType<string>;
  message: string;
  checks?: readonly Check[];
  default?: { nonProduction: string };
  pair?: string;
};

export type Variables = Readonly<Record<string, VariableSpec>>;

export type Slice<T extends Variables = Variables> = { readonly variables: T };

export type AppSchema<T extends Variables = Variables> = {
  readonly name: string;
  readonly variables: T;
};

type ValueOf<V extends VariableSpec> = V["required"] extends "always"
  ? string
  : V extends { default: { nonProduction: string } }
    ? string
    : string | undefined;

export type EnvOf<T extends Variables> = {
  [K in keyof T]: T[K] extends VariableSpec ? ValueOf<T[K]> : never;
};

export type Problem = { name: string; rule: string };

export type ParseResult<T extends Variables> =
  { ok: true; env: EnvOf<T> } | { ok: false; problems: Problem[] };

const TIERS: readonly Tier[] = ["development", "test", "production"];

const TIER_RULE = "required, one of development, test, production";

export function defineEnv<const T extends Variables>(variables: T): Slice<T> {
  return { variables };
}

export const coreEnv = defineEnv({
  AFT_ENV: {
    description:
      "Which environment this is: development on your machine, test in CI, production on the server.",
    secret: false,
    required: "always",
    schema: z.enum(["development", "test", "production"]),
    message: TIER_RULE,
  },
});

export function composeEnv<const S extends readonly Slice[]>(
  name: string,
  slices: S,
): AppSchema<UnionVariables<S>> {
  const variables: Record<string, VariableSpec> = {};
  for (const slice of slices) {
    for (const [key, spec] of Object.entries(slice.variables)) {
      if (key in variables) throw new Error(`[env] ${key} is declared in more than one slice`);
      variables[key] = spec;
    }
  }
  return { name, variables: variables as UnionVariables<S> };
}

type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (
  i: infer I,
) => void
  ? I
  : never;

type UnionVariables<S extends readonly Slice[]> =
  UnionToIntersection<S[number]["variables"]> extends infer V extends Variables ? V : Variables;

type Source = Readonly<Record<string, string | undefined>>;

// An empty or whitespace only value counts as unset; other values are trimmed (AC-4, I48).
function read(source: Source, name: string): string | undefined {
  const value = source[name]?.trim();
  return value ? value : undefined;
}

function resolveTier(source: Source, nodeEnv: string | undefined): Tier | Problem {
  const value = read(source, "AFT_ENV");
  const tier = TIERS.find((t) => t === value);
  if (!tier) return { name: "AFT_ENV", rule: TIER_RULE };
  if (tier === "production" && nodeEnv !== "production") {
    return {
      name: "AFT_ENV",
      rule: "production needs NODE_ENV=production (use next start, not next dev)",
    };
  }
  return tier;
}

export function parseEnv<T extends Variables>(
  schema: AppSchema<T> | Slice<T>,
  source: Source,
  nodeEnv: string | undefined,
): ParseResult<T> {
  const problems = new Map<string, string>();
  const env: Record<string, string | undefined> = {};

  // The tier comes first; when AFT_ENV is invalid, every rule that needs it is skipped.
  const resolved = resolveTier(source, nodeEnv);
  const tier = typeof resolved === "string" ? resolved : undefined;
  if (typeof resolved !== "string" && "AFT_ENV" in schema.variables) {
    problems.set(resolved.name, resolved.rule);
  }

  for (const [name, spec] of Object.entries(schema.variables)) {
    if (name === "AFT_ENV") {
      if (tier) env[name] = tier;
      continue;
    }
    const value = read(source, name);

    if (value === undefined) {
      if (spec.pair && read(source, spec.pair) !== undefined) {
        const names = [name, spec.pair].sort();
        problems.set(name, `set ${names[0]} and ${names[1]} together, or neither`);
      } else if (spec.required === "always") {
        problems.set(name, "required");
      } else if (spec.required === "production" && tier === "production") {
        problems.set(name, "required when AFT_ENV is production");
      } else if (spec.default && tier !== "production") {
        env[name] = spec.default.nonProduction;
      }
      continue;
    }

    if (!spec.schema.safeParse(value).success) {
      problems.set(name, spec.message);
      continue;
    }
    if (tier) {
      const refused = (spec.checks ?? []).map((check) => check(value, tier)).find(Boolean);
      if (refused) {
        problems.set(name, refused);
        continue;
      }
    }
    env[name] = value;
  }

  if (problems.size > 0) {
    const sorted = [...problems].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return { ok: false, problems: sorted.map(([name, rule]) => ({ name, rule })) };
  }
  return { ok: true, env: env as EnvOf<T> };
}

export function formatProblems(header: string, problems: readonly Problem[]): string {
  return [header, ...problems.map(({ name, rule }) => `  - ${name}: ${rule}`)].join("\n");
}

export class EnvError extends Error {
  readonly problems: readonly Problem[];

  constructor(problems: readonly Problem[]) {
    super(
      formatProblems(
        "[env] Invalid environment variables (.env locally, Parameter Store in production):",
        problems,
      ),
    );
    this.name = "EnvError";
    this.problems = problems;
  }
}

// The start check: every problem at once, names only, then exit 1 (AC-1, AC-2).
export function checkEnvOrExit(schema: AppSchema): void {
  const result = parseEnv(schema, process.env, process.env.NODE_ENV);
  if (result.ok) return;
  const header =
    `[env] The ${schema.name} app can't start. Fix these variables ` +
    `(.env locally, Parameter Store /aft/prod/${schema.name}/ in production):`;
  console.error(formatProblems(header, result.problems));
  process.exit(1);
}

// Parses AFT_ENV plus the slice on every call, no cache (AC-9, I51).
export function createEnvAccessor<T extends Variables>(slice: Slice<T>): () => EnvOf<T> {
  return () => {
    const variables: Variables = { ...coreEnv.variables, ...slice.variables };
    const result = parseEnv({ variables }, process.env, process.env.NODE_ENV);
    if (!result.ok) throw new EnvError(result.problems);
    const env: Record<string, string | undefined> = {};
    for (const name of Object.keys(slice.variables)) env[name] = result.env[name];
    return env as EnvOf<T>;
  };
}

export function aftEnv(): Tier {
  const result = parseEnv(coreEnv, process.env, process.env.NODE_ENV);
  if (!result.ok) throw new EnvError(result.problems);
  return result.env.AFT_ENV as Tier;
}

// The B13 rule: test mode keys are refused in production only (AC-8).
export function liveKeyInProduction(prefixes: readonly string[]): Check {
  return (value, tier) =>
    tier === "production" && prefixes.some((prefix) => value.startsWith(prefix))
      ? "test mode key, not allowed in production"
      : null;
}

export type EnvSchemaJson = {
  app: string;
  variables: {
    name: string;
    description: string;
    secret: boolean;
    required: VariableSpec["required"];
    pair?: string;
  }[];
};

// The deploy's env-schema.json (spec 0007 AC-9): names and metadata, never a value.
export function toEnvSchemaJson(schema: AppSchema): EnvSchemaJson {
  return {
    app: schema.name,
    variables: Object.entries(schema.variables)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, spec]) => ({
        name,
        description: spec.description,
        secret: spec.secret,
        required: spec.required,
        ...(spec.pair ? { pair: spec.pair } : {}),
      })),
  };
}
