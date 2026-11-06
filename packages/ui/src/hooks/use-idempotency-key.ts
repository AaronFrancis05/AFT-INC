import * as React from "react";

// One idempotency key per mounted form (spec 0011, X1). Send it as `idempotencyKey` with every
// try of the same submit, including a retry after a thrown call (a network failure), and call
// rotate() only after `ok: true`, so the next submit is a new request. Send the key from an event
// handler and never render it: the server and the browser each make their own, so markup holding
// it would not hydrate. crypto.randomUUID needs a secure origin (https or localhost).
export function useIdempotencyKey() {
  const [key, setKey] = React.useState(() => crypto.randomUUID());
  const rotate = React.useCallback(() => setKey(crypto.randomUUID()), []);
  return { key, rotate };
}
