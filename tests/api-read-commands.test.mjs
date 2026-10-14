import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

const apiRequest = jest.fn();
const output = jest.fn();
jest.unstable_mockModule("../src/api.mjs", () => ({ apiRequest }));
jest.unstable_mockModule("../src/output.mjs", () => ({ output }));
const { runReadCommand } = await import("../src/api-read-commands.mjs");

afterEach(() => {
  jest.restoreAllMocks();
  process.exitCode = undefined;
});
beforeEach(() => {
  process.env.MAIL_OWNER_ADDRESS = "owner@example.test";
  apiRequest.mockReset().mockResolvedValue([]);
  output.mockReset();
});

test("routes message and sent reads", async () => {
  const options = { limit: 5, before: "day", search: "term", address: "other@example.test" };
  await runReadCommand("list", [], options);
  await runReadCommand("headers", ["m/1"], options);
  await runReadCommand("read", ["m-1", "m-2"], options);
  await runReadCommand("thread", ["m-1"], options);
  await runReadCommand("sent", [], options);
  await runReadCommand("sent-read", ["o-1"], options);
  await runReadCommand("outbound-status", ["o-1"], options);
  expect(apiRequest).toHaveBeenCalledWith(
    "/api/messages?limit=5&before=day&search=term&address=other%40example.test",
  );
  expect(apiRequest).toHaveBeenCalledWith("/api/messages/m%2F1/headers");
  expect(apiRequest).toHaveBeenCalledWith(
    "/api/sent?limit=5&before=day&search=term&from=owner%40example.test",
  );
  expect(output).toHaveBeenCalled();
});

test("scopes inbox and fails without owner address", async () => {
  await runReadCommand("inbox", [], { limit: 3 });
  expect(apiRequest).toHaveBeenCalledWith("/api/inbox?limit=3&address=owner%40example.test");
  delete process.env.MAIL_OWNER_ADDRESS;
  await expect(runReadCommand("sent", [], {})).rejects.toMatchObject({
    code: "MAIL_OWNER_ADDRESS_REQUIRED",
  });
});

test("routes search, health, domains, and unknown commands", async () => {
  apiRequest.mockResolvedValueOnce({ results: ["match"] });
  await runReadCommand("search", ["hello world"], {});
  expect(apiRequest).toHaveBeenCalledWith("/api/search?q=hello%20world");
  apiRequest.mockResolvedValueOnce({ readiness: { ready: true } });
  await runReadCommand("health", [], {});
  expect(process.exitCode).toBe(0);
  apiRequest.mockResolvedValueOnce({ readiness: { ready: false } });
  await runReadCommand("health", [], {});
  expect(process.exitCode).toBe(1);
  await runReadCommand("domains", [], {});
  await expect(runReadCommand("other", [], {})).resolves.toBeUndefined();
});
