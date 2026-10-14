import { afterEach, expect, jest, test } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apiRequest = jest.fn();
const output = jest.fn();
jest.unstable_mockModule("../src/api.mjs", () => ({ apiRequest }));
jest.unstable_mockModule("../src/output.mjs", () => ({ output }));
const { commandJsonInput, many, ownerAddress, query } =
  await import("../src/api-command-utils.mjs");

afterEach(() => jest.restoreAllMocks());

test("builds query strings and leaves empty queries empty", () => {
  expect(query({ limit: 2, absent: undefined }, ["limit", "absent"])).toBe("?limit=2");
  expect(query({}, ["limit"])).toBe("");
});

test("returns one or many API results", async () => {
  apiRequest.mockResolvedValueOnce({ id: "one" });
  await many(["one"], (id) => `/api/${id}`, {});
  expect(output).toHaveBeenLastCalledWith({ id: "one" }, {});
  apiRequest.mockResolvedValue({ id: "many" });
  await many(["one", "two"], (id) => `/api/${id}`, {});
  expect(output).toHaveBeenLastCalledWith([{ id: "many" }, { id: "many" }], {});
});

test("requires and trims owner scope", () => {
  process.env.MAIL_OWNER_ADDRESS = " owner@example.test ";
  expect(ownerAddress()).toBe("owner@example.test");
  delete process.env.MAIL_OWNER_ADDRESS;
  expect(ownerAddress).toThrow("MAIL_OWNER_ADDRESS must be configured");
});

test("reads command input from an explicit source or stdin", async () => {
  await expect(commandJsonInput({ inputJson: { body: "inline" } })).resolves.toEqual({
    body: "inline",
  });
  const handlers = {};
  jest.spyOn(process.stdin, "setEncoding").mockImplementation(() => process.stdin);
  jest.spyOn(process.stdin, "on").mockImplementation((event, handler) => {
    handlers[event] = handler;
    return process.stdin;
  });
  const input = commandJsonInput({});
  handlers.data('{"body":"stdin"}');
  handlers.end();
  await expect(input).resolves.toEqual({ body: "stdin" });
});

test("reads command JSON from a file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mailctl-command-input-"));
  const file = join(directory, "request.json");
  try {
    await writeFile(file, '{"body":"file"}');
    await expect(commandJsonInput({ input: file })).resolves.toEqual({ body: "file" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
