// Writes the Functions' copy of every rule shared by the shop and the server (src/shared/CLAUDE.md).
// src/shared/<name>.ts is the one source; functions/shared/<name>.js is its CommonJS translation, committed so
// the Functions deploy (which uploads only functions/) carries it. `node scripts/build-shared.mjs` rewrites the
// copies; `--check` fails when one is missing, stale or left over (scripts/sharedRules.test.ts runs the same check).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SHARED_SRC = join(root, "src/shared");
export const SHARED_OUT = join(root, "functions/shared");

const header = name => `// GENERATED from src/shared/${name}.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.\n`;

/** A shared file may import only other shared files, so its copy works inside functions/shared too. */
export function importProblems(name, source) {
  const out = [];
  for (const [, from] of source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)) {
    if (!/^\.\/[\w-]+$/.test(from)) out.push(`src/shared/${name}.ts imports "${from}": shared files may import only "./<other shared file>"`);
  }
  return out;
}

export function sharedNames() {
  return readdirSync(SHARED_SRC).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts")).map(f => f.slice(0, -3)).sort();
}

/** { name, text } for every functions/shared copy, translated from its source. */
export function buildShared() {
  return sharedNames().map(name => {
    const source = readFileSync(join(SHARED_SRC, `${name}.ts`), "utf8");
    const problems = importProblems(name, source);
    if (problems.length) throw new Error(problems.join("\n"));
    const { outputText, diagnostics } = ts.transpileModule(source, {
      fileName: `${name}.ts`,
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, removeComments: false, newLine: ts.NewLineKind.LineFeed },
    });
    if (diagnostics?.length) throw new Error(`src/shared/${name}.ts: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n")}`);
    return { name, text: header(name) + outputText };
  });
}

/** Problems with the committed copies (empty = up to date). */
export function checkShared() {
  const built = buildShared();
  const problems = [];
  for (const { name, text } of built) {
    const file = join(SHARED_OUT, `${name}.js`);
    if (!existsSync(file)) problems.push(`functions/shared/${name}.js is missing`);
    else if (readFileSync(file, "utf8") !== text) problems.push(`functions/shared/${name}.js is out of date`);
  }
  const names = new Set(built.map(b => b.name));
  for (const f of existsSync(SHARED_OUT) ? readdirSync(SHARED_OUT) : []) {
    if (!names.has(f.replace(/\.js$/, ""))) problems.push(`functions/shared/${f} has no source in src/shared`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const problems = checkShared();
    if (problems.length) {
      console.error(`${problems.join("\n")}\nRun: node scripts/build-shared.mjs`);
      process.exit(1);
    }
    console.log("Shared rules: the Functions' copies are up to date.");
  } else {
    mkdirSync(SHARED_OUT, { recursive: true });
    const built = buildShared();
    const names = new Set(built.map(b => `${b.name}.js`));
    for (const f of readdirSync(SHARED_OUT)) if (!names.has(f)) rmSync(join(SHARED_OUT, f));
    for (const { name, text } of built) writeFileSync(join(SHARED_OUT, `${name}.js`), text);
    console.log(`Wrote ${built.length} shared file(s) to functions/shared.`);
  }
}
