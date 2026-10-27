import { renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useSessionStorageValue } from "./use-session-storage-value";

describe("useSessionStorageValue", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("returns the stored value for the key", () => {
    sessionStorage.setItem("verify_email", "ada@example.com");

    const { result } = renderHook(() => useSessionStorageValue("verify_email"));

    expect(result.current).toBe("ada@example.com");
  });

  it("returns null when the key is not stored", () => {
    const { result } = renderHook(() => useSessionStorageValue("reset_email"));

    expect(result.current).toBeNull();
  });

  it("reads only its own key", () => {
    sessionStorage.setItem("verify_email", "ada@example.com");

    const { result } = renderHook(() => useSessionStorageValue("reset_email"));

    expect(result.current).toBeNull();
  });

  it("renders null on the server, so markup never depends on the browser", () => {
    sessionStorage.setItem("verify_email", "ada@example.com");
    function Probe() {
      return createElement("span", null, useSessionStorageValue("verify_email") ?? "none");
    }

    expect(renderToString(createElement(Probe))).toBe("<span>none</span>");
  });
});
