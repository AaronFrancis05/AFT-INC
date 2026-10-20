import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

// jsdom has no matchMedia, so a fake one stands in for the browser.
function fakeMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  const matchMedia = vi.fn((query: string) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
  });
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    queries,
    listeners,
    resize(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

describe("useIsMobile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true when the viewport is below 768px", () => {
    fakeMatchMedia(true);

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("is false on a desktop viewport", () => {
    fakeMatchMedia(false);

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it("asks for widths up to 767px", () => {
    const media = fakeMatchMedia(false);

    renderHook(() => useIsMobile());

    expect(media.queries).toContain("(max-width: 767px)");
  });

  it("updates when the viewport crosses the breakpoint", () => {
    const media = fakeMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());

    act(() => media.resize(true));

    expect(result.current).toBe(true);
  });

  it("stops listening after unmount", () => {
    const media = fakeMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    expect(media.listeners.size).toBe(1);

    unmount();

    expect(media.listeners.size).toBe(0);
  });
});
