import { expect, jest, test } from "@jest/globals";

const runReadCommand = jest.fn().mockResolvedValue("read");
jest.unstable_mockModule("../src/api-read-commands.mjs", () => ({ runReadCommand }));
jest.unstable_mockModule("../src/api-attachment-commands.mjs", () => ({
  runAttachmentCommand: jest.fn(),
}));
jest.unstable_mockModule("../src/api-send-commands.mjs", () => ({ runSendCommand: jest.fn() }));
jest.unstable_mockModule("../src/api-delivery-commands.mjs", () => ({
  runDeliveryCommand: jest.fn(),
}));
jest.unstable_mockModule("../src/api-delete-command.mjs", () => ({ runDeleteCommand: jest.fn() }));
const { runApiCommand } = await import("../src/api-commands.mjs");

test("routes known commands to the owning handler", async () => {
  await expect(runApiCommand("list", [], {})).resolves.toBe("read");
  expect(runReadCommand).toHaveBeenCalledWith("list", [], {});
});

test("returns no result for an unknown command", async () => {
  await expect(runApiCommand("unknown", [], {})).resolves.toBeUndefined();
});
