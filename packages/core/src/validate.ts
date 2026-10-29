// Input checks every boundary uses (spec 0011, AC-6, AC-7).
import { z } from "zod";
import { AppError, type FieldErrors } from "./errors";

// A strict object: an unknown key is a validation error naming it (X20).
export function input<const T extends z.ZodRawShape>(shape: T) {
  return z.strictObject(shape);
}

export type TextOptions = {
  // Required: no boundary string is unbounded. Counted in code points after normalizing.
  max: number;
  min?: number;
  // Allows tab and line feed, and turns \r\n and \r into \n first.
  multiline?: boolean;
};

// Unicode Cc: U+0000 to U+001F and U+007F to U+009F. A loop, not a regex, keeps no-control-regex quiet.
function hasControl(value: string, multiline: boolean): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (multiline && (code === 0x09 || code === 0x0a)) continue;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

// The bidirectional override and isolate characters (U+202A to U+202E, U+2066 to U+2069).
const BIDI = /[‪-‮⁦-⁩]/;

// A boundary string: NFC, trimmed, no control or bidi characters, well formed, bounded (X21).
export function text({ max, min = 0, multiline = false }: TextOptions) {
  if (!Number.isSafeInteger(max) || !Number.isSafeInteger(min) || min < 0 || max < Math.max(min, 1))
    throw new RangeError("text() needs a positive integer max that is at least min");
  return z
    .string()
    .transform((value) =>
      (multiline ? value.replace(/\r\n?/g, "\n") : value).normalize("NFC").trim(),
    )
    .superRefine((value, context) => {
      const fail = (message: string) => context.addIssue({ code: "custom", message });
      if (!value.isWellFormed()) return fail("Contains invalid characters");
      if (hasControl(value, multiline) || BIDI.test(value))
        return fail("Contains characters that are not allowed");
      const length = [...value].length;
      if (length < min) fail(min === 1 ? "Is required" : `Must be at least ${min} characters`);
      if (length > max) fail(`Must be at most ${max} characters`);
    });
}

// Fixed texts per rule; zod's own text is never shown, since some issues echo the input.
const MESSAGES: Readonly<Record<string, string>> = {
  invalid_type: "Has the wrong type",
  too_small: "Is too small",
  too_big: "Is too large",
  invalid_format: "Has the wrong format",
  not_multiple_of: "Is not an allowed value",
  invalid_value: "Is not an allowed value",
  invalid_union: "Is not an allowed value",
  invalid_key: "Has an invalid key",
  invalid_element: "Has an invalid entry",
  unrecognized_keys: "Unknown field",
};

const joinPath = (path: readonly PropertyKey[]) => path.map(String).join(".");

// Dotted paths ("items.0.name", "" for the root); an unknown key is reported at its own path.
export function zodToFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  const add = (path: string, message: string) => (fields[path] ??= []).push(message);
  for (const issue of error.issues) {
    const parent = joinPath(issue.path);
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys)
        add(parent ? `${parent}.${key}` : key, MESSAGES.unrecognized_keys!);
    } else {
      add(parent, issue.code === "custom" ? issue.message : (MESSAGES[issue.code] ?? "Is invalid"));
    }
  }
  return fields;
}

// Parses with the schema, or throws validation_failed with the field problems.
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError("validation_failed", undefined, {
      fieldErrors: zodToFieldErrors(result.error),
    });
  return result.data;
}

// The default and the ceiling for a route's maxBodyBytes (spec 0011).
export const DEFAULT_MAX_BODY_BYTES = 100_000;
export const MAX_BODY_BYTES_CEILING = 1_000_000;

// application/json, optionally with charset=utf-8 (any case); nothing else (X23).
function isJsonContentType(header: string | null): boolean {
  if (!header) return false;
  const [type, ...parameters] = header.split(";").map((part) => part.trim().toLowerCase());
  if (type !== "application/json") return false;
  return parameters.every((parameter) => /^charset="?utf-8"?$/.test(parameter));
}

// Reads the stream with a byte counter and stops at the cap, so a body without
// Content-Length can't grow past it (X22).
async function readLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number) {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError("payload_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// A request's JSON body: 415 for another media type, 413 past the cap, 400 for bad UTF 8 or JSON.
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("content-type")))
    throw new AppError("unsupported_media_type");
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes)
    throw new AppError("payload_too_large");
  const bytes = await readLimited(request.body, maxBytes);
  let source: string;
  try {
    // fatal rejects invalid UTF 8; a leading BOM is dropped.
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AppError("bad_request", "The body is not valid UTF-8");
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new AppError("bad_request", "The body is not valid JSON");
  }
}
