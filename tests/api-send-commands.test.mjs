import { afterEach, expect, jest, test } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apiRequest = jest.fn();
const output = jest.fn();
jest.unstable_mockModule("../src/api.mjs", () => ({ apiRequest }));
jest.unstable_mockModule("../src/output.mjs", () => ({ output }));
const { runSendCommand } = await import("../src/api-send-commands.mjs");

afterEach(() => {
  jest.restoreAllMocks();
  process.env.MAIL_OWNER_ADDRESS = "owner@example.test";
});
beforeEach(() => {
  process.env.MAIL_OWNER_ADDRESS = "owner@example.test";
  apiRequest.mockReset().mockResolvedValue({ sent: true });
  output.mockReset();
});

test("sends replies, reply-all, and forwards through the send API", async () => {
  await runSendCommand("reply", ["m-1"], { inputJson: { body: "thanks" } });
  await runSendCommand("reply-all", ["m-2"], { inputJson: { body: "team" } });
  await runSendCommand("forward", ["m-3"], { inputJson: { body: "FYI" } });
  expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/send", {
    method: "POST",
    body: {
      body: "thanks",
      from: "owner@example.test",
      replyToMessageId: "m-1",
      replyMode: "reply",
    },
  });
  expect(apiRequest).toHaveBeenNthCalledWith(3, "/api/send", {
    method: "POST",
    body: {
      body: "FYI",
      from: "owner@example.test",
      forwardMessageId: "m-3",
      replyMode: "forward",
    },
  });
});

test("rejects invalid reply inputs and supports reply dry-run", async () => {
  await expect(runSendCommand("reply", [], { inputJson: {} })).rejects.toMatchObject({
    code: "MESSAGE_ID_REQUIRED",
  });
  await expect(
    runSendCommand("reply", ["m-1"], { inputJson: { from: "other@example.test" } }),
  ).rejects.toMatchObject({ code: "INVALID_REPLY_FIELDS" });
  await runSendCommand("reply", ["m-1"], { inputJson: { body: "preview" }, "dry-run": true });
  expect(output).toHaveBeenCalledWith(
    expect.objectContaining({ dryRun: true, action: "reply" }),
    expect.any(Object),
  );
});

test("sends JSON and dry-run requests with owner scope", async () => {
  await runSendCommand("send", [], { inputJson: { to: ["user@example.test"], body: "text" } });
  expect(apiRequest).toHaveBeenCalledWith("/api/send", {
    method: "POST",
    body: { to: ["user@example.test"], body: "text", from: "owner@example.test" },
  });
  await runSendCommand("send", [], { inputJson: { to: [], dryRun: true } });
  expect(output).toHaveBeenCalledWith(
    expect.objectContaining({ dryRun: true }),
    expect.any(Object),
  );
  await expect(
    runSendCommand("send", [], { inputJson: { from: "forged@example.test" } }),
  ).rejects.toMatchObject({
    code: "INVALID_SEND_FIELDS",
  });
  await runSendCommand("send", [], { inputJson: { attachments: null } });
});

test("uploads file attachments as multipart data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mailctl-send-"));
  try {
    const path = join(directory, "file.txt");
    await writeFile(path, "attachment");
    await runSendCommand("send", [], {
      inputJson: { to: ["user@example.test"], cc: ["copy@example.test"], attachments: [path] },
    });
    const form = apiRequest.mock.calls[0][1].body;
    expect(apiRequest.mock.calls[0][0]).toBe("/api/send-multipart");
    expect(form.get("cc")).toBe("copy@example.test");
    expect(form.get("attachment").name).toBe("file.txt");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("returns no result for unrelated commands", async () => {
  await expect(runSendCommand("retry", [], {})).resolves.toBeUndefined();
});
