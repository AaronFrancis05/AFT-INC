// Cursor pages for list routes (spec 0011, AC-17): `?cursor=&limit=` in, `{ data, nextCursor }`
// out, newest first by UUID v7 id. Cursors are unsigned (ids are not secrets, and row level
// security still applies).
import { z } from "zod";
import { AppError } from "./errors";
import { input, text } from "./validate";

export type Cursor = { id: string };
export type Page<T> = { data: T[]; nextCursor: string | null };

const CURSOR_MESSAGE = "Is not a valid cursor";
const cursorShape = z.strictObject({ id: z.string().min(1).max(200) });

function toBase64Url(value: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("not base64url");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeCursor(cursor: Cursor): string {
  return toBase64Url(JSON.stringify({ id: cursor.id }));
}

// { id }, or validation_failed on `cursor`.
export function decodeCursor(cursor: string): Cursor {
  try {
    return cursorShape.parse(JSON.parse(fromBase64Url(cursor)));
  } catch {
    throw new AppError("validation_failed", undefined, {
      fieldErrors: { cursor: [CURSOR_MESSAGE] },
    });
  }
}

// The query schema for a list route. `cursor` comes out decoded, so the repository gets the id.
export const pageInput = input({
  cursor: text({ max: 200 })
    .transform((value, context): Cursor | undefined => {
      if (value === "") return undefined;
      try {
        return decodeCursor(value);
      } catch {
        context.addIssue({ code: "custom", message: CURSOR_MESSAGE });
        return z.NEVER;
      }
    })
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Repositories fetch limit + 1 rows; the extra row only says another page exists.
export function toPage<T extends { id: string }>(rows: readonly T[], limit: number): Page<T> {
  const data = rows.slice(0, limit);
  const last = data.at(-1);
  return { data, nextCursor: rows.length > limit && last ? encodeCursor({ id: last.id }) : null };
}
