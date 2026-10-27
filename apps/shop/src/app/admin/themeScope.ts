import { isSurfaceKey } from "../features/site/designModel";

/**
 * Apply visual theme keys to the whole site (presets, Riso Noir default): the keys are set on the
 * root and any page overrides of those keys are cleared, so every page shows them. Page-local
 * content such as section stacks is untouched. `surfaceIds` is kept for callers.
 */
export function applyThemeKeysToSurfaces(
  design: Record<string, any>,
  keys: Record<string, any>,
  _surfaceIds?: string[],
) {
  const next: Record<string, any> = { ...design, ...keys };
  for (const id of Object.keys(next)) {
    if (!isSurfaceKey(id) || !next[id] || typeof next[id] !== "object") continue;
    const surface = { ...next[id] };
    for (const key of Object.keys(keys)) delete surface[key];
    next[id] = surface;
  }
  return next;
}
