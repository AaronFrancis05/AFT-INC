import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, pageInput, toPage } from "./pagination";
import { parseInput } from "./validate";

const id = "019a3b4c-0000-7000-8000-000000000001";

describe("cursors (AC-17)", () => {
  it("round trips an id through base64url JSON", () => {
    const cursor = encodeCursor({ id });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual({ id });
    expect(decodeCursor(encodeCursor({ id: "ü/+?" }))).toEqual({ id: "ü/+?" });
  });

  it("a cursor that does not decode is validation_failed on cursor", () => {
    const json = (value: unknown) =>
      btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    for (const bad of ["!!!", "abc", json({ id: 1 }), json({ id: id, extra: 1 }), json([id])])
      expect(() => decodeCursor(bad), bad).toThrow(
        expect.objectContaining({
          code: "validation_failed",
          fieldErrors: { cursor: ["Is not a valid cursor"] },
        }),
      );
  });
});

describe("pageInput (AC-17)", () => {
  it("defaults limit to 20, coerces the query string, and decodes the cursor", () => {
    expect(parseInput(pageInput, {})).toEqual({ limit: 20 });
    expect(parseInput(pageInput, { limit: "5", cursor: encodeCursor({ id }) })).toEqual({
      limit: 5,
      cursor: { id },
    });
    expect(parseInput(pageInput, { cursor: "" })).toEqual({ limit: 20, cursor: undefined });
  });

  it("limit is 1 to 100; a bad cursor or an unknown key is validation_failed", () => {
    for (const [query, path] of [
      [{ limit: "0" }, "limit"],
      [{ limit: "101" }, "limit"],
      [{ limit: "2.5" }, "limit"],
      [{ limit: "ten" }, "limit"],
      [{ cursor: "nope" }, "cursor"],
      [{ cursor: "x".repeat(201) }, "cursor"],
      [{ sort: "asc" }, "sort"],
    ] as const) {
      try {
        parseInput(pageInput, query);
        throw new Error(`accepted ${JSON.stringify(query)}`);
      } catch (error) {
        expect(error).toMatchObject({ code: "validation_failed" });
        expect(Object.keys((error as { fieldErrors: object }).fieldErrors)).toEqual([path]);
      }
    }
  });
});

describe("toPage (AC-17)", () => {
  const rows = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: `id${count - index}`, n: index }));

  it("returns limit rows and a cursor for the last one when an extra row was fetched", () => {
    const page = toPage(rows(4), 3);
    expect(page.data.map((row) => row.id)).toEqual(["id4", "id3", "id2"]);
    expect(page.nextCursor && decodeCursor(page.nextCursor)).toEqual({ id: "id2" });
  });

  it("nextCursor is null on the last page", () => {
    expect(toPage(rows(3), 3)).toEqual({ data: rows(3), nextCursor: null });
    expect(toPage([], 20)).toEqual({ data: [], nextCursor: null });
  });
});
