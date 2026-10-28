// Types for eslint.mjs, so its test typechecks under the root tsconfig.
export function groupByWorkspace(
  files: string[],
  root: string,
): { groups: Map<string, string[]>; outside: string[] };
