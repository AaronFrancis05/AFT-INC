import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, REDACT_KEYS } from "./log";

// A destination that keeps each JSON line.
function capture() {
  const lines: Record<string, unknown>[] = [];
  return {
    lines,
    stream: {
      write: (line: string) => void lines.push(JSON.parse(line) as Record<string, unknown>),
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createLogger", () => {
  it("covers AC-12: writes level label, ISO UTC time, msg, service, and env, with no pid or hostname", () => {
    const { lines, stream } = capture();
    createLogger({ service: "web", destination: stream, level: "info" }).info(
      { userId: "u1" },
      "hello",
    );
    const line = lines[0]!;
    expect(line).toMatchObject({
      level: "info",
      msg: "hello",
      service: "web",
      env: "test",
      userId: "u1",
    });
    expect(line.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(line).not.toHaveProperty("pid");
    expect(line).not.toHaveProperty("hostname");
  });

  it("X29: redacts every listed key at the top level and one level down", () => {
    const { lines, stream } = capture();
    const logger = createLogger({ service: "web", destination: stream, level: "info" });
    const values = Object.fromEntries(REDACT_KEYS.map((key) => [key, "leak"]));
    logger.info({ ...values, user: values, name: "projects.create", code: "not_found" }, "x");
    const line = lines[0]!;
    for (const key of REDACT_KEYS) {
      expect(line[key], key).toBe("[redacted]");
      expect((line.user as Record<string, unknown>)[key], `user.${key}`).toBe("[redacted]");
    }
    // name and code stay readable: the access line uses them (AC-13).
    expect(line).toMatchObject({ name: "projects.create", code: "not_found" });
  });

  it("covers AC-12: is built on first use, so creating one reads no env", () => {
    vi.stubEnv("LOG_LEVEL", "nonsense");
    const { stream } = capture();
    const logger = createLogger({ service: "web", destination: stream });
    expect(() => logger.info("x")).toThrow(/LOG_LEVEL/);
  });

  it("covers AC-12: takes LOG_LEVEL, else the tier default (silent in test)", () => {
    const quiet = capture();
    createLogger({ service: "web", destination: quiet.stream }).error("dropped");
    expect(quiet.lines).toEqual([]);

    vi.stubEnv("LOG_LEVEL", "warn");
    const loud = capture();
    const logger = createLogger({ service: "web", destination: loud.stream });
    logger.info("dropped");
    logger.warn("kept");
    expect(loud.lines.map((line) => line.msg)).toEqual(["kept"]);
  });

  it("child loggers keep their bindings and the redaction", () => {
    const { lines, stream } = capture();
    const child = createLogger({ service: "web", destination: stream, level: "info" }).child({
      requestId: "r1",
    });
    child.info({ token: "t" }, "x");
    expect(lines[0]).toMatchObject({ requestId: "r1", token: "[redacted]" });
  });
});
