import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jest, describe, expect, test } from "@jest/globals";

const generate = jest.fn().mockReturnValue("generated-id");
const publishExchange = jest.fn().mockResolvedValue(undefined);
const closeRabbit = jest.fn().mockResolvedValue(undefined);
const output = jest.fn();
const root = await mkdtemp(join(tmpdir(), "mailctl-outbound-"));

jest.unstable_mockModule("@eliware/snowflake", () => ({ generate }));
jest.unstable_mockModule("@eliware/rabbitmq", () => ({
  close: closeRabbit,
  publishExchange,
}));
jest.unstable_mockModule("../src/output.mjs", () => ({ output }));
jest.unstable_mockModule("../src/runtime.mjs", () => ({
  bodyValue: async (value) => value || null,
  outboundQueue: "mail.outbound.submit",
  rabbitOptions: () => ({ rabbitUrl: "amqp://example.test" }),
  storageRoot: root,
}));
jest.unstable_mockModule("../src/args.mjs", () => ({
  dateFilter: jest.fn(),
  limitValue: (value) => Number(value) || 10,
  required: (options, key) => {
    if (!options[key]) throw new Error(`--${key} is required`);
    return options[key];
  },
  values: (value) => (Array.isArray(value) ? value : value ? [value] : []),
}));

const { readSent, saveOutboundAttachment, send, updateOutbound } =
  await import("../src/outbound.mjs");

function makeConnection({ fail = false } = {}) {
  return {
    beginTransaction: jest.fn(),
    query: jest.fn(async (sql) => {
      if (fail) throw new Error("transaction failed");
      if (sql.startsWith("SELECT attachment_id"))
        return [[{ attachment_id: "stored-attachment" }]];
      return [[]];
    }),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };
}

describe("outbound uncovered branches", () => {
  test("rejects missing sent messages and uses empty headers", async () => {
    await expect(
      readSent(["missing"], {}, { query: async () => [[]] }),
    ).rejects.toThrow("sent message not found");
    let call = 0;
    const db = {
      query: async () => {
        call += 1;
        if (call === 1) return [[{ outbound_id: "out-1", headers_json: null }]];
        return [[]];
      },
    };
    await expect(readSent(["out-1"], {}, db)).resolves.toBeUndefined();
  });

  test("reads multiple sent messages and valid headers", async () => {
    let calls = 0;
    const db = {
      query: async (sql) => {
        calls += 1;
        if (sql.includes("outbound_messages"))
          return [
            [
              {
                outbound_id: `out-${calls}`,
                headers_json: "{}",
                body_text: "body",
              },
            ],
          ];
        return [[]];
      },
    };
    await expect(
      readSent(["out-1", "out-2"], { json: true }, db),
    ).resolves.toBeUndefined();
  });

  test("retries outbound work and closes RabbitMQ", async () => {
    const dbConnection = makeConnection();
    await updateOutbound(
      ["out-1", "out-2"],
      "retry",
      { yes: true },
      { getConnection: async () => dbConnection },
    );
    expect(publishExchange).toHaveBeenCalledTimes(2);
    expect(closeRabbit).toHaveBeenCalled();
  });

  test("rolls back a failed outbound update", async () => {
    const dbConnection = makeConnection({ fail: true });
    await expect(
      updateOutbound(
        ["out-1"],
        "cancel",
        { yes: true },
        { getConnection: async () => dbConnection },
      ),
    ).rejects.toThrow("transaction failed");
    expect(dbConnection.rollback).toHaveBeenCalled();
    expect(dbConnection.release).toHaveBeenCalled();
  });

  test("validates outbound update arguments", async () => {
    await expect(updateOutbound([], "retry", {}, {})).rejects.toThrow(
      "requires at least one",
    );
    await expect(updateOutbound(["out-1"], "retry", {}, {})).rejects.toThrow(
      "requires --yes",
    );
  });

  test("queues a managed message transactionally", async () => {
    const dbConnection = makeConnection();
    const db = {
      query: jest.fn().mockResolvedValue([[{ domain_id: "domain-1" }]]),
      getConnection: async () => dbConnection,
    };
    await send(
      {
        sender: "agent@example.test",
        recipient: ["user@example.test"],
        subject: "Subject",
        text: "Body",
      },
      db,
    );
    expect(dbConnection.commit).toHaveBeenCalled();
    expect(publishExchange).toHaveBeenCalled();
  });

  test("stores and deduplicates an outbound attachment", async () => {
    const attachment = join(root, "attachment.txt");
    await writeFile(attachment, "attachment body");
    const dbConnection = makeConnection();
    const db = {
      query: jest.fn().mockResolvedValue([[{ domain_id: "domain-1" }]]),
      getConnection: async () => dbConnection,
    };
    await send(
      {
        sender: "agent@example.test",
        recipient: "user@example.test",
        attachment,
      },
      db,
    );
    expect(dbConnection.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO attachments"),
      expect.any(Array),
    );
    await saveOutboundAttachment(attachment);
    await saveOutboundAttachment(attachment);
    const errorAttachment = join(root, "error-attachment.txt");
    await writeFile(errorAttachment, "different attachment body");
    await expect(
      saveOutboundAttachment(errorAttachment, true, {
        writeFileFn: jest
          .fn()
          .mockRejectedValue(Object.assign(new Error("disk"), { code: "EIO" })),
      }),
    ).rejects.toThrow("disk");
    await send(
      {
        sender: "agent@example.test",
        recipient: "user@example.test",
        attachment,
        "dry-run": true,
      },
      db,
    );
  });

  test("rolls back a failed send transaction", async () => {
    const dbConnection = makeConnection({ fail: true });
    const db = {
      query: jest.fn().mockResolvedValue([[{ domain_id: "domain-1" }]]),
      getConnection: async () => dbConnection,
    };
    await expect(
      send(
        { sender: "agent@example.test", recipient: "user@example.test" },
        db,
      ),
    ).rejects.toThrow("transaction failed");
    expect(dbConnection.rollback).toHaveBeenCalled();
  });

  test("validates sender and recipients before sending", async () => {
    await expect(
      send({ recipient: "user@example.test" }, { query: jest.fn() }),
    ).rejects.toThrow("--sender is required");
    await expect(
      send({ sender: "agent@example.test" }, { query: jest.fn() }),
    ).rejects.toThrow("--recipient is required");
  });
});
