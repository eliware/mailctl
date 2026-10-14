import { afterEach, expect, jest, test } from "@jest/globals";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runApiCommand = jest.fn();
jest.unstable_mockModule("../src/api-commands.mjs", () => ({ runApiCommand }));
const { runCli } = await import("../src/cli.mjs");
const entrypoint = fileURLToPath(new URL("../bin/mailctl.mjs", import.meta.url));

afterEach(() => jest.restoreAllMocks());

test("handles help, version, and command dispatch", async () => {
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  await runCli(["--version"]);
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({ version: "12.0.0" });
  await runCli(["help", "send"]);
  expect(JSON.parse(log.mock.calls[1][0]).help).toContain("mailctl send");
  await runCli(["--help", "send"]);
  expect(JSON.parse(log.mock.calls[2][0]).help).toContain("Commands:");
  await runCli(["list", "m-1"]);
  expect(runApiCommand).toHaveBeenCalledWith("list", ["m-1"], {});
});

async function runProcess(args, handler, extraEnv = {}) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const child = spawn(process.execPath, [entrypoint, ...args], {
    env: {
      ...process.env,
      MAIL_API_URL: `http://127.0.0.1:${port}`,
      MAIL_API_TOKEN: "local-test-token",
      MAIL_OWNER_ADDRESS: "owner@example.test",
      ...extraEnv,
    },
    windowsHide: true,
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const [code] = await once(child, "close");
  await new Promise((resolve) => server.close(resolve));
  return {
    code,
    stdout: Buffer.concat(stdout).toString(),
    stderr: Buffer.concat(stderr).toString(),
  };
}

test("sends authenticated API requests and returns JSON", async () => {
  const result = await runProcess(["list", "--limit", "2"], (request, response) => {
    expect(request.url).toBe("/api/messages?limit=2");
    expect(request.headers.authorization).toBe("Bearer local-test-token");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: [{ message_id: "m-1" }] }));
  });
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual([{ message_id: "m-1" }]);
  expect(result.stderr).toBe("");
});

test("reports API errors and unhealthy readiness with exit code one", async () => {
  const failed = await runProcess(["domains"], (_request, response) => {
    response.statusCode = 401;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: { code: "AUTH_FAILED", message: "unauthorized" } }));
  });
  expect(failed.code).toBe(1);
  expect(JSON.parse(failed.stderr).error.code).toBe("AUTH_FAILED");
  const unhealthy = await runProcess(["health"], (_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: { readiness: { ready: false } } }));
  });
  expect(unhealthy.code).toBe(1);
  expect(JSON.parse(unhealthy.stdout).healthy).toBe(false);
});

test("uploads and saves attachment files through the API", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mailctl-cli-contract-"));
  const file = join(directory, "upload.txt");
  const savedDirectory = join(directory, "saved");
  await writeFile(file, "upload bytes");
  try {
    const upload = await runProcess(
      ["send", JSON.stringify({ to: ["user@example.test"], attachments: [file] })],
      (request, response) => {
        expect(request.url).toBe("/api/send-multipart");
        expect(request.headers.authorization).toBe("Bearer local-test-token");
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ data: { outbound_id: "out-1" } }));
      },
    );
    expect(upload.code).toBe(0);
    const download = await runProcess(
      ["save-attachments", "m-1", savedDirectory],
      (request, response) => {
        response.setHeader("content-type", "application/json");
        if (request.url === "/api/messages/m-1")
          return response.end(
            JSON.stringify({
              data: { attachments: [{ attachment_id: "a-1", original_filename: "note.txt" }] },
            }),
          );
        if (request.url === "/api/attachments/a-1") return response.end("attachment bytes");
        response.statusCode = 404;
        response.end(JSON.stringify({ error: "missing" }));
      },
    );
    expect(download.code).toBe(0);
    expect(await readFile(join(savedDirectory, "note.txt"), "utf8")).toBe("attachment bytes");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
