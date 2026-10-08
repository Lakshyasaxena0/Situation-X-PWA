// Runs the unit tests: bundles src/__tests__/*.test.ts with esbuild and runs them with node --test.
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const dir = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(dir, "src/__tests__");
const files = readdirSync(testDir).filter((f) => f.endsWith(".test.ts")).map((f) => path.join(testDir, f));
const out = path.join(dir, ".test-out");
rmSync(out, { recursive: true, force: true });

await build({
  entryPoints: files,
  outdir: out,
  outExtension: { ".js": ".mjs" },
  platform: "node",
  format: "esm",
  bundle: true,
  // everything is bundled (workspace packages are TypeScript sources); a CJS shim covers packages that use require()
  plugins: [
    {
      // the real logger spawns pino workers; tests use a silent stand-in
      name: "stub-logger",
      setup(b) {
        b.onResolve({ filter: /lib\/logger(\.js)?$/ }, () => ({ path: path.join(testDir, "stub-logger.ts") }));
      },
    },
  ],
  banner: {
    js: `import { createRequire as __r } from 'node:module';
import __p from 'node:path';
import __u from 'node:url';
globalThis.require = __r(import.meta.url);
globalThis.__filename = __u.fileURLToPath(import.meta.url);
globalThis.__dirname = __p.dirname(globalThis.__filename);`,
  },
  logLevel: "error",
});

const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "postgres://u:p@127.0.0.1:5432/test", NODE_ENV: "test" };
const run = spawnSync(process.execPath, ["--test", ...files.map((f) => path.join(out, path.basename(f).replace(/\.ts$/, ".mjs")))], { stdio: "inherit", env, cwd: dir });
rmSync(out, { recursive: true, force: true });
process.exit(run.status ?? 1);
