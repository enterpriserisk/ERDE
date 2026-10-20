// Builds the app for Vercel by writing .vercel/output in the Build Output API
// format (https://vercel.com/docs/build-output-api): the React app is served
// as static files and the Express API runs as one Vercel Function at /api.
import { execSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".vercel/output");

function run(command, env = {}) {
  execSync(command, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + "\n");
}

await rm(output, { recursive: true, force: true });

// Create or update the database tables to match lib/db/src/schema.
run("pnpm --filter @workspace/db run push");

// Frontend. vite.config.ts requires PORT even though builds don't use it.
run("pnpm --filter @workspace/drde-app run build", {
  NODE_ENV: "production",
  PORT: "3000",
  BASE_PATH: "/",
});
await cp(
  path.join(root, "artifacts/drde-app/dist/public"),
  path.join(output, "static"),
  { recursive: true },
);

// API. esbuild bundles the Express app and its dependencies into dist/app.mjs,
// so the function needs no node_modules.
run("pnpm --filter @workspace/api-server run build", { NODE_ENV: "production" });
const fn = path.join(output, "functions/api.func");
await cp(path.join(root, "artifacts/api-server/dist"), fn, {
  recursive: true,
  // index.mjs starts a standalone server, which the function doesn't use.
  filter: (src) => !path.basename(src).startsWith("index.mjs"),
});
await writeJson(path.join(fn, ".vc-config.json"), {
  runtime: "nodejs24.x",
  handler: "app.mjs",
  launcherType: "Nodejs",
  // Express parses request bodies itself.
  shouldAddHelpers: false,
  shouldAddSourcemapSupport: true,
  // Reports are generated after the response (see waitUntil in
  // routes/analysis.ts); 300s is the Hobby plan maximum.
  maxDuration: 300,
  environment: { NODE_ENV: "production" },
});

await writeJson(path.join(output, "config.json"), {
  version: 3,
  routes: [
    { src: "^/api(?:/.*)?$", dest: "/api" },
    { handle: "filesystem" },
    // Any other path loads the app, which handles routing in the browser.
    { src: "/.*", dest: "/index.html" },
  ],
});
