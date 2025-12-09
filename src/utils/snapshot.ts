import type { Snapshot } from "../types";

export const cloneSnapshot = (s: Snapshot): Snapshot =>
  JSON.parse(JSON.stringify(s));
