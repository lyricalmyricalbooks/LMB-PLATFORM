// Typed edges: one small schema says what a request (or record) carries, checks it at the boundary and gives both
// sides the same TypeScript type (`Infer`). Dependency-free on purpose: it runs in the shop and, through its generated
// copy (src/shared/CLAUDE.md), in the Functions' payment path, where a new package would be one more thing to deploy.
// Objects ignore keys they don't list and return only the listed ones, so an older client sending extras still works.

export type Check<T> = { readonly parse: (value: unknown, path: string) => T };
export type Infer<S> = S extends Check<infer T> ? T : never;

export class EdgeError extends Error {
  constructor(readonly path: string, readonly expected: string) {
    super(`${path || "body"}: expected ${expected}`);
  }
}

const fail = (path: string, expected: string): never => { throw new EdgeError(path, expected); };
const at = (path: string, key: string | number) => (typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key);

export function string(opts: { min?: number; max?: number; pattern?: RegExp; label?: string } = {}): Check<string> {
  const expected = opts.label || "text";
  return {
    parse(value, path) {
      if (typeof value !== "string") return fail(path, expected);
      if (value.length < (opts.min ?? 0) || value.length > (opts.max ?? 10_000)) return fail(path, expected);
      if (opts.pattern && !opts.pattern.test(value)) return fail(path, expected);
      return value;
    },
  };
}

export function number(opts: { int?: boolean; min?: number; max?: number } = {}): Check<number> {
  const expected = opts.int ? "a whole number" : "a number";
  return {
    parse(value, path) {
      if (typeof value !== "number" || !Number.isFinite(value)) return fail(path, expected);
      if (opts.int && !Number.isInteger(value)) return fail(path, expected);
      if ((opts.min != null && value < opts.min) || (opts.max != null && value > opts.max)) return fail(path, expected);
      return value;
    },
  };
}

export const boolean = (): Check<boolean> => ({ parse: (value, path) => (typeof value === "boolean" ? value : fail(path, "true or false")) });

export function oneOf<const T extends readonly string[]>(values: T): Check<T[number]> {
  return { parse: (value, path) => (values.includes(value as string) ? value as T[number] : fail(path, values.map(v => `"${v}"`).join(" or "))) };
}

/** Missing (undefined) passes as undefined. */
export function optional<T>(inner: Check<T>): Check<T | undefined> {
  return { parse: (value, path) => (value === undefined ? undefined : inner.parse(value, path)) };
}

export function nullable<T>(inner: Check<T>): Check<T | null> {
  return { parse: (value, path) => (value === null ? null : inner.parse(value, path)) };
}

export function array<T>(inner: Check<T>, opts: { max?: number } = {}): Check<T[]> {
  return {
    parse(value, path) {
      if (!Array.isArray(value) || value.length > (opts.max ?? 1000)) return fail(path, `a list${opts.max != null ? ` of at most ${opts.max}` : ""}`);
      return value.map((item, i) => inner.parse(item, at(path, i)));
    },
  };
}

type Shape = Record<string, Check<unknown>>;
type Optionals<S extends Shape> = { [K in keyof S]: undefined extends Infer<S[K]> ? K : never }[keyof S];
export type ObjectOf<S extends Shape> =
  { [K in Exclude<keyof S, Optionals<S>>]: Infer<S[K]> } & { [K in Optionals<S>]?: Infer<S[K]> };

export function object<S extends Shape>(shape: S): Check<ObjectOf<S>> {
  return {
    parse(value, path) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return fail(path, "an object");
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        const parsed = shape[key].parse((value as Record<string, unknown>)[key], at(path, key));
        if (parsed !== undefined) out[key] = parsed;
      }
      return out as ObjectOf<S>;
    },
  };
}

/** { ok: true, value } or { ok: false, error } — never throws. */
export function check<T>(schema: Check<T>, value: unknown): { ok: true; value: T } | { ok: false; error: EdgeError } {
  try {
    return { ok: true, value: schema.parse(value, "") };
  } catch (err) {
    if (err instanceof EdgeError) return { ok: false, error: err };
    throw err;
  }
}
