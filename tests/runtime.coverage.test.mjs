import { jest, describe, expect, test } from "@jest/globals";
import { writeFile } from "node:fs/promises";

const createDb = jest.fn().mockResolvedValue("db");
const getRabbitUrl = jest.fn();
jest.unstable_mockModule("@eliware/mysql", () => ({ createDb }));
jest.unstable_mockModule("@eliware/rabbitmq", () => ({ getRabbitUrl }));

const { bodyValue, dbConnection, rabbitOptions, storagePath } =
  await import("../src/runtime.mjs");

describe("runtime connection branches", () => {
  test("creates a database connection", async () => {
    await expect(dbConnection()).resolves.toBe("db");
    expect(createDb).toHaveBeenCalledWith({});
  });

  test("builds persistent RabbitMQ options", () => {
    getRabbitUrl.mockReturnValue("amqp://example.test");
    expect(rabbitOptions()).toEqual({
      rabbitUrl: "amqp://example.test",
      messageOptions: { persistent: true, contentType: "application/json" },
    });
  });

  test("returns inline values when a path is not a file", async () => {
    await expect(bodyValue("not-a-file")).resolves.toBe("not-a-file");
    await expect(bodyValue("/tmp")).resolves.toBe("/tmp");
    await writeFile("/tmp/mailctl-runtime-coverage.txt", "file body");
    await expect(bodyValue("/tmp/mailctl-runtime-coverage.txt")).resolves.toBe(
      "file body",
    );
    expect(storagePath(".")).toBe(storagePath(""));
  });
});
