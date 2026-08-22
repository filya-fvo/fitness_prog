import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer as createViteServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = "http://127.0.0.1:5173";
let server = null;
const apiServer = createHttpServer((_request, response) => {
  response.writeHead(503, {
    "content-type": "application/json; charset=utf-8",
    connection: "close",
  });
  response.end(JSON.stringify({ detail: "E2E API fallback" }));
});

await new Promise((resolve, reject) => {
  apiServer.once("error", reject);
  apiServer.listen(0, "127.0.0.1", resolve);
});
const apiAddress = apiServer.address();
if (!apiAddress || typeof apiAddress === "string") {
  throw new Error("Unable to allocate the E2E API port");
}
process.env.VITE_PROXY_TARGET = `http://127.0.0.1:${apiAddress.port}`;

async function isRunning() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

if (!(await isRunning())) {
  server = await createViteServer({
    root,
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
}

const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const child = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});

if (server) await server.close();
await new Promise((resolve) => apiServer.close(resolve));
process.exitCode = exitCode;
