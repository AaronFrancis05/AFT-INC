import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "./errors";
import { input, parseInput, readJsonBody, text, zodToFieldErrors } from "./validate";

function failure(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) throw new Error("expected a failure");
  return zodToFieldErrors(result.error);
}

describe("input", () => {
  it("X20: rejects an unknown key, naming it at its own path", () => {
    const schema = input({
      title: text({ max: 10 }),
      meta: input({ tag: text({ max: 5 }) }).optional(),
    });
    expect(failure(schema, { title: "a", extra: 1 })).toEqual({ extra: ["Unknown field"] });
    expect(failure(schema, { title: "a", meta: { tag: "b", isAdmin: true } })).toEqual({
      "meta.isAdmin": ["Unknown field"],
    });
  });

  it("covers AC-6: paths are dotted, with array indexes", () => {
    const schema = input({ items: z.array(input({ name: text({ max: 3 }) })) });
    expect(failure(schema, { items: [{ name: "ok" }, { name: "toolong" }] })).toEqual({
      "items.1.name": ["Must be at most 3 characters"],
    });
  });

  it("covers AC-6: uses fixed messages, never zod's own text", () => {
    expect(failure(input({ n: z.number() }), { n: "secret-value" })).toEqual({
      n: ["Has the wrong type"],
    });
  });
});

describe("text", () => {
  it("X21: normalizes to NFC, then trims", () => {
    expect(text({ max: 10 }).parse("  Café ")).toBe("Café");
  });

  it("X21: counts code points, not UTF 16 units", () => {
    expect(text({ max: 2 }).parse("😀😀")).toBe("😀😀");
    expect(failure(text({ max: 1 }), "😀😀")).toEqual({ "": ["Must be at most 1 characters"] });
  });

  it("X21: rejects control characters, bidi overrides, and broken Unicode", () => {
    for (const bad of ["a\u0000b", "a\u0007b", "a\u0085b", "a\tb", "a\nb", "a‮b", "a⁦b"])
      expect(failure(text({ max: 10 }), bad)).toEqual({
        "": ["Contains characters that are not allowed"],
      });
    expect(failure(text({ max: 10 }), "a\uD800b")).toEqual({ "": ["Contains invalid characters"] });
  });

  it("X21: multiline allows tab and line feed and turns CRLF into LF", () => {
    expect(text({ max: 10, multiline: true }).parse("a\r\nb\tc\rd")).toBe("a\nb\tc\nd");
    expect(failure(text({ max: 10, multiline: true }), "a\u000Bb")).toEqual({
      "": ["Contains characters that are not allowed"],
    });
  });

  it("covers AC-6: min counts after trimming", () => {
    expect(failure(text({ max: 5, min: 1 }), "   ")).toEqual({ "": ["Is required"] });
  });

  it("refuses an unbounded definition", () => {
    expect(() => text({ max: 0 })).toThrow(RangeError);
    expect(() => text({ max: 3, min: 4 })).toThrow(RangeError);
  });
});

describe("parseInput", () => {
  it("throws validation_failed with field errors", () => {
    const error = (() => {
      try {
        parseInput(input({ a: text({ max: 1 }) }), { a: "toolong" });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "validation_failed",
      fieldErrors: { a: ["Must be at most 1 characters"] },
    });
  });
});

const url = "http://localhost/api/v1/things";
const json = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (caught) {
    return (caught as AppError).code;
  }
  return "ok";
}

describe("readJsonBody", () => {
  it("covers AC-7: parses JSON and accepts charset=utf-8 in any case", async () => {
    await expect(readJsonBody(json('{"a":1}'), 100)).resolves.toEqual({ a: 1 });
    await expect(
      readJsonBody(json("[]", { "content-type": "Application/JSON; Charset=UTF-8" }), 100),
    ).resolves.toEqual([]);
  });

  it("X23: refuses other media types and other parameters with 415", async () => {
    for (const type of [
      "text/plain",
      "application/problem+json",
      "application/json; charset=latin1",
    ])
      expect(await codeOf(readJsonBody(json("{}", { "content-type": type }), 100))).toBe(
        "unsupported_media_type",
      );
    expect(await codeOf(readJsonBody(new Request(url, { method: "POST", body: "{}" }), 100))).toBe(
      "unsupported_media_type",
    );
  });

  it("X22: refuses a body over the cap from Content-Length, before reading", async () => {
    const request = json("{}", { "content-length": "101" });
    expect(await codeOf(readJsonBody(request, 100))).toBe("payload_too_large");
  });

  it("X22: refuses a streamed body with no Content-Length once it passes the cap", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('"' + "x".repeat(60)));
      },
    });
    const request = new Request(url, {
      method: "POST",
      body: stream,
      headers: { "content-type": "application/json" },
      duplex: "half",
    } as RequestInit);
    expect(request.headers.get("content-length")).toBeNull();
    expect(await codeOf(readJsonBody(request, 100))).toBe("payload_too_large");
  });

  it("covers AC-7: invalid UTF 8 and malformed JSON are bad_request; a BOM is dropped", async () => {
    expect(await codeOf(readJsonBody(json(new Uint8Array([0x7b, 0xff, 0x7d])), 100))).toBe(
      "bad_request",
    );
    expect(await codeOf(readJsonBody(json("{nope"), 100))).toBe("bad_request");
    expect(await codeOf(readJsonBody(json(""), 100))).toBe("bad_request");
    await expect(readJsonBody(json("﻿{}"), 100)).resolves.toEqual({});
  });
});
