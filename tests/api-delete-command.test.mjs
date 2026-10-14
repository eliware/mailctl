import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

const apiRequest = jest.fn();
const output = jest.fn();
jest.unstable_mockModule("../src/api.mjs", () => ({ apiRequest }));
jest.unstable_mockModule("../src/output.mjs", () => ({ output }));
const { runDeleteCommand } = await import("../src/api-delete-command.mjs");

afterEach(() => jest.restoreAllMocks());
beforeEach(() => {
  apiRequest.mockReset().mockResolvedValue({ results: [] });
  output.mockReset();
});

test("requires a delete target and confirmation", async () => {
  await expect(runDeleteCommand("delete", [], { inputJson: {} })).rejects.toMatchObject({
    code: "DELETE_TARGET_REQUIRED",
  });
  await expect(
    runDeleteCommand("delete", [], { inputJson: { ids: ["m-1"] } }),
  ).rejects.toMatchObject({ code: "DELETE_CONFIRMATION_REQUIRED" });
});

test("previews query deletion without writes", async () => {
  apiRequest.mockResolvedValueOnce({ results: [{ id: "m-1" }] });
  await runDeleteCommand("delete", [], { inputJson: { query: "old", dryRun: true } });
  expect(apiRequest).toHaveBeenCalledTimes(1);
  expect(output).toHaveBeenCalledWith(
    { dryRun: true, action: "delete", ids: ["m-1"] },
    expect.any(Object),
  );
});

test("deletes inbound and outbound results", async () => {
  apiRequest.mockResolvedValueOnce({ results: [{ id: "m-1" }, { id: "o-1", kind: "outbound" }] });
  await runDeleteCommand("delete", [], { inputJson: { query: "old", confirm: true } });
  expect(apiRequest).toHaveBeenCalledWith("/api/messages/m-1", { method: "DELETE" });
  expect(apiRequest).toHaveBeenCalledWith("/api/sent/o-1", { method: "DELETE" });
  expect(output).toHaveBeenLastCalledWith({ deleted: ["m-1", "o-1"] }, expect.any(Object));
});

test("returns no result for unrelated commands", async () => {
  await expect(runDeleteCommand("send", [], {})).resolves.toBeUndefined();
});
