import { describe, expect, test } from "@jest/globals";
import { deleteMail } from "../src/delete.mjs";

describe("delete command", () => {
  test("previews deletion without a database write", async () => {
    const db = { query: async () => [[]] };
    await expect(
      deleteMail(["message-1"], { "dry-run": true, json: true }, db),
    ).resolves.toBeUndefined();
  });
  test("requires confirmation", async () => {
    await expect(deleteMail(["message-1"], {}, {})).rejects.toThrow(
      "refusing to delete",
    );
  });
  test("supports query dry-runs", async () => {
    const db = { query: async () => [[{ message_id: "1" }]] };
    await expect(
      deleteMail([], { query: "subject", "dry-run": true, json: true }, db),
    ).resolves.toBeUndefined();
  });
  test("requires IDs when a query returns no messages", async () => {
    const db = { query: async () => [[]] };
    await expect(deleteMail([], { query: "missing" }, db)).rejects.toThrow(
      "delete requires message IDs",
    );
  });
  test("deletes records transactionally", async () => {
    const calls = [];
    const connection = {
      beginTransaction: async () => calls.push("begin"),
      query: async (...args) => { calls.push(args); return [[]]; },
      commit: async () => calls.push("commit"),
      rollback: async () => calls.push("rollback"),
      release: () => calls.push("release"),
    };
    const db = { getConnection: async () => connection };
    await expect(
      deleteMail(["1", "2"], { yes: true, json: true }, db),
    ).resolves.toBeUndefined();
    expect(calls).toContain("commit");
    expect(calls).toContain("release");
  });
  test("rolls back when deletion fails", async () => {
    const calls = [];
    const connection = {
      beginTransaction: async () => calls.push("begin"),
      query: async () => {
        throw new Error("db failed");
      },
      commit: async () => {},
      rollback: async () => calls.push("rollback"),
      release: () => calls.push("release"),
    };
    await expect(
      deleteMail(
        ["1"],
        { yes: true },
        { getConnection: async () => connection },
      ),
    ).rejects.toThrow("db failed");
    expect(calls).toEqual(["begin", "rollback", "release"]);
  });

  test("soft-deletes inbound and outbound records without hard deletes", async () => {
    const queries = [];
    const connection = {
      beginTransaction: async () => {},
      query: async (...args) => {
        queries.push(args[0]);
        if (args[0].startsWith("SELECT message_id")) return [[{ message_id: "in-1", discord_message_id: "discord-in", discord_channel_id: "channel" }]];
        if (args[0].startsWith("SELECT outbound_id")) return [[{ outbound_id: "out-1", discord_message_id: "discord-out", discord_channel_id: "channel" }]];
        return [[]];
      },
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    };
    await deleteMail(["in-1", "out-1"], { yes: true, json: true }, { getConnection: async () => connection });
    expect(queries.every((sql) => !/^DELETE\s/i.test(sql))).toBe(true);
    expect(queries).toEqual(expect.arrayContaining([
      expect.stringContaining("UPDATE messages SET deleted_at"),
      expect.stringContaining("UPDATE outbound_messages SET deleted_at"),
    ]));
  });

  test("does not enqueue Discord events without Discord correlation", async () => {
    const queries = [];
    const connection = {
      beginTransaction: async () => {},
      query: async (...args) => {
        queries.push(args[0]);
        if (args[0].startsWith("SELECT message_id")) return [[{ message_id: "in-1" }]];
        if (args[0].startsWith("SELECT outbound_id")) return [[{ outbound_id: "out-1" }]];
        return [[]];
      },
      commit: async () => {}, rollback: async () => {}, release: () => {},
    };
    await deleteMail(["id"], { yes: true, json: true }, { getConnection: async () => connection });
    expect(queries.some((sql) => sql.includes("event_outbox"))).toBe(false);
  });
});
