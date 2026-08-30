import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "@jest/globals";

const entrypoint = fileURLToPath(new URL("../mailctl.mjs", import.meta.url));

async function runCli(serverHandler, args) {
  const server = createServer(serverHandler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const child = spawn(process.execPath, [entrypoint, ...args], {
    env: { ...process.env, MAIL_API_URL: `http://127.0.0.1:${port}`, MAIL_API_TOKEN: "test-token" },
    windowsHide: true,
  });
  const chunks = { stdout: [], stderr: [] };
  child.stdout.on("data", (chunk) => chunks.stdout.push(chunk));
  child.stderr.on("data", (chunk) => chunks.stderr.push(chunk));
  const [result] = await once(child, "close");
  await new Promise((resolve) => server.close(resolve));
  return { code: result, stdout: Buffer.concat(chunks.stdout).toString(), stderr: Buffer.concat(chunks.stderr).toString() };
}

describe("API CLI contract", () => {
  test("routes API mode and preserves JSON output and bearer auth", async () => {
    const result = await runCli((request, response) => {
      expect(request.url).toBe("/api/messages?limit=2");
      expect(request.headers.authorization).toBe("Bearer test-token");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [{ message_id: "m-1" }], request_id: "req-1" }));
    }, ["list", "--limit", "2", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([{ message_id: "m-1" }]);
    expect(result.stderr).toBe("");
  });

  test("returns exit code 1 and stable JSON for API failures", async () => {
    const result = await runCli((_request, response) => {
      response.statusCode = 401;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: { code: "AUTH_FAILED", message: "unauthorized" }, request_id: "req-auth" }));
    }, ["domains", "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({ error: { code: "AUTH_FAILED", message: "unauthorized" }, request_id: "req-auth" });
  });

  test("returns exit code 1 for unhealthy API status", async () => {
    const result = await runCli((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { state: { status: "degraded" }, readiness: { ready: false } }, request_id: "req-health" }));
    }, ["health", "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).healthy).toBe(false);
  });

});
