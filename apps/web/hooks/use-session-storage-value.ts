import * as React from "react";

// sessionStorage has no change event within the same tab, so there is nothing to subscribe to.
function subscribe() {
  return () => {};
}

// Reads a sessionStorage value. It is null during server rendering and before hydration.
export function useSessionStorageValue(key: string): string | null {
  return React.useSyncExternalStore(
    subscribe,
    () => window.sessionStorage.getItem(key),
    () => null,
  );
}
