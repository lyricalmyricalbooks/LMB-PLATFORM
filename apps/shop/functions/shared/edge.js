// GENERATED from src/shared/edge.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Typed edges: one small schema says what a request (or record) carries, checks it at the boundary and gives both
// sides the same TypeScript type (`Infer`). Dependency-free on purpose: it runs in the shop and, through its generated
// copy (src/shared/CLAUDE.md), in the Functions' payment path, where a new package would be one more thing to deploy.
// Objects ignore keys they don't list and return only the listed ones, so an older client sending extras still works.
Object.defineProperty(exports, "__esModule", { value: true });
exports.boolean = exports.EdgeError = void 0;
exports.string = string;
exports.number = number;
exports.oneOf = oneOf;
exports.optional = optional;
exports.nullable = nullable;
exports.array = array;
exports.object = object;
exports.check = check;
class EdgeError extends Error {
    path;
    expected;
    constructor(path, expected) {
        super(`${path || "body"}: expected ${expected}`);
        this.path = path;
        this.expected = expected;
    }
}
exports.EdgeError = EdgeError;
const fail = (path, expected) => { throw new EdgeError(path, expected); };
const at = (path, key) => (typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key);
function string(opts = {}) {
    const expected = opts.label || "text";
    return {
        parse(value, path) {
            if (typeof value !== "string")
                return fail(path, expected);
            if (value.length < (opts.min ?? 0) || value.length > (opts.max ?? 10_000))
                return fail(path, expected);
            if (opts.pattern && !opts.pattern.test(value))
                return fail(path, expected);
            return value;
        },
    };
}
function number(opts = {}) {
    const expected = opts.int ? "a whole number" : "a number";
    return {
        parse(value, path) {
            if (typeof value !== "number" || !Number.isFinite(value))
                return fail(path, expected);
            if (opts.int && !Number.isInteger(value))
                return fail(path, expected);
            if ((opts.min != null && value < opts.min) || (opts.max != null && value > opts.max))
                return fail(path, expected);
            return value;
        },
    };
}
const boolean = () => ({ parse: (value, path) => (typeof value === "boolean" ? value : fail(path, "true or false")) });
exports.boolean = boolean;
function oneOf(values) {
    return { parse: (value, path) => (values.includes(value) ? value : fail(path, values.map(v => `"${v}"`).join(" or "))) };
}
/** Missing (undefined) passes as undefined. */
function optional(inner) {
    return { parse: (value, path) => (value === undefined ? undefined : inner.parse(value, path)) };
}
function nullable(inner) {
    return { parse: (value, path) => (value === null ? null : inner.parse(value, path)) };
}
function array(inner, opts = {}) {
    return {
        parse(value, path) {
            if (!Array.isArray(value) || value.length > (opts.max ?? 1000))
                return fail(path, `a list${opts.max != null ? ` of at most ${opts.max}` : ""}`);
            return value.map((item, i) => inner.parse(item, at(path, i)));
        },
    };
}
function object(shape) {
    return {
        parse(value, path) {
            if (!value || typeof value !== "object" || Array.isArray(value))
                return fail(path, "an object");
            const out = {};
            for (const key of Object.keys(shape)) {
                const parsed = shape[key].parse(value[key], at(path, key));
                if (parsed !== undefined)
                    out[key] = parsed;
            }
            return out;
        },
    };
}
/** { ok: true, value } or { ok: false, error } — never throws. */
function check(schema, value) {
    try {
        return { ok: true, value: schema.parse(value, "") };
    }
    catch (err) {
        if (err instanceof EdgeError)
            return { ok: false, error: err };
        throw err;
    }
}
