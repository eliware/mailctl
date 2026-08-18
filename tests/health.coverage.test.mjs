import { jest, describe, expect, test } from "@jest/globals";

const access = jest.fn();
const verifyConnection = jest.fn();
const close = jest.fn();
const output = jest.fn();

jest.unstable_mockModule("node:fs/promises", () => ({ access }));
jest.unstable_mockModule("@eliware/rabbitmq", () => ({
  verifyConnection,
  close,
}));
jest.unstable_mockModule("../src/output.mjs", () => ({ output }));
jest.unstable_mockModule("../src/runtime.mjs", () => ({
  rabbitOptions: jest.fn(() => ({ rabbitUrl: "amqp://example.test" })),
  storageRoot: "/tmp/mailctl-storage",
}));

const { health } = await import("../src/health.mjs");

describe("health failure and success branches", () => {
  test("reports all dependencies healthy", async () => {
    access.mockResolvedValue(undefined);
    verifyConnection.mockResolvedValue(undefined);
    const db = { query: jest.fn().mockResolvedValue([[]]) };
    await health({}, db);
    expect(output).toHaveBeenCalledWith(
      { database: "ok", rabbitmq: "ok", storage: "ok", status: "ok" },
      {},
    );
  });

  test("reports broker and storage failures", async () => {
    process.exitCode = undefined;
    access.mockRejectedValue(new Error("storage unavailable"));
    verifyConnection.mockRejectedValue(new Error("broker unavailable"));
    await health(
      {},
      { query: jest.fn().mockRejectedValue(new Error("db unavailable")) },
    );
    expect(output).toHaveBeenCalledWith(
      {
        database: "failed",
        rabbitmq: "failed",
        storage: "failed",
        status: "degraded",
      },
      {},
    );
    expect(process.exitCode).toBe(2);
    process.exitCode = undefined;
  });
});
