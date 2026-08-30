import { jest, describe, expect, test } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    const directory = await mkdtemp(join(tmpdir(), "mailctl-runtime-"));
    try {
      await expect(bodyValue(directory)).resolves.toBe(directory);
      const path = join(directory, "body.txt");
      await writeFile(path, "file body");
      await expect(bodyValue(path)).resolves.toBe("file body");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    expect(storagePath(".")).toBe(storagePath(""));
  });
});
