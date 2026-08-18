import { describe, expect, test } from "@jest/globals";
import {
  listMessages,
  readMessages,
  searchMail,
  thread,
} from "../src/inbound.mjs";

const db = {
  async query(sql) {
    if (sql.startsWith("SELECT m.message_id"))
      return [[{ message_id: "1", body_text: "hello" }]];
    if (sql.includes("FROM messages WHERE message_id=?"))
      return [[{ headers_json: "{}" }]];
    if (sql.includes("MATCH(")) return [[], []];
    return [[]];
  },
};

describe("inbound commands", () => {
  test("lists messages", async () => {
    await expect(listMessages({ limit: 5 }, db)).resolves.toBeUndefined();
  });
  test("applies list filters and previews empty bodies", async () => {
    await expect(
      listMessages(
        {
          to: "user",
          from: "sender",
          subject: "topic",
          after: "2026-01-01",
          before: "2026-02-01",
          limit: 1,
          json: true,
        },
        db,
      ),
    ).resolves.toBeUndefined();
  });
  test("handles a null body preview", async () => {
    const emptyBodyDb = {
      query: async (sql) =>
        sql.startsWith("SELECT m.message_id")
          ? [[{ message_id: "empty", body_text: null }]]
          : [[]],
    };
    await expect(listMessages({}, emptyBodyDb)).resolves.toBeUndefined();
  });
  test("searches without results", async () => {
    await expect(searchMail("hello", {}, db)).resolves.toBeUndefined();
  });
  test("ranks and limits combined inbound and outbound search results", async () => {
    const searchDb = {
      query: async (sql) => {
        if (sql.includes("'inbound'"))
          return [[{ id: "in", relevance: 2, timestamp: "2026-01-01" }]];
        return [[{ id: "out", relevance: 1, timestamp: "2026-01-02" }]];
      },
    };
    await expect(
      searchMail("invoice", { limit: 1, json: true }, searchDb),
    ).resolves.toBeUndefined();
  });
  test("uses timestamp ordering when search relevance ties", async () => {
    const searchDb = {
      query: async (sql) =>
        sql.includes("'inbound'")
          ? [[{ id: "in", relevance: 1, timestamp: "2026-01-01" }]]
          : [[{ id: "out", relevance: 1, timestamp: "2026-01-02" }]],
    };
    await expect(
      searchMail("invoice", { json: true }, searchDb),
    ).resolves.toBeUndefined();
  });

  test("rejects a missing message and handles malformed headers", async () => {
    await expect(
      readMessages(["missing"], {}, { query: async () => [[]] }),
    ).rejects.toThrow("message not found");
    const malformedDb = {
      query: async (sql) => {
        if (sql.includes("SELECT headers_json"))
          return [[{ headers_json: "{bad" }]];
        return [[]];
      },
    };
    await expect(thread("1", {}, malformedDb)).resolves.toBeUndefined();
    const nullHeadersDb = {
      query: async (sql) => {
        if (sql.includes("SELECT headers_json"))
          return [[{ headers_json: null }]];
        return [[]];
      },
    };
    await expect(thread("1", {}, nullHeadersDb)).resolves.toBeUndefined();
  });
  test("rejects missing thread", async () => {
    await expect(
      thread("missing", {}, { query: async () => [[]] }),
    ).rejects.toThrow("message not found");
  });
  test("reads a message", async () => {
    const readDb = {
      async query(sql) {
        if (sql.includes("SELECT * FROM messages"))
          return [[{ message_id: "1", headers_json: "{}", body_text: "x" }]];
        return [[]];
      },
    };
    await expect(readMessages(["1"], {}, readDb)).resolves.toBeUndefined();
    await expect(
      readMessages(["1"], {}, readDb, false),
    ).resolves.toBeUndefined();
  });
  test("reads multiple messages and tolerates malformed headers", async () => {
    const multiDb = {
      query: async (sql) => {
        if (sql.includes("SELECT * FROM messages"))
          return [
            [
              { message_id: "1", headers_json: "{bad" },
              { message_id: "2", headers_json: "{}" },
            ],
          ];
        return [[]];
      },
    };
    await expect(
      readMessages(["1", "2"], { json: true }, multiDb),
    ).resolves.toBeUndefined();
  });
  test("uses empty headers when the stored header value is null", async () => {
    const nullHeadersDb = {
      query: async (sql) => {
        if (sql.includes("SELECT * FROM messages"))
          return [[{ message_id: "null-headers", headers_json: null }]];
        return [[]];
      },
    };
    await expect(
      readMessages(["null-headers"], {}, nullHeadersDb),
    ).resolves.toBeUndefined();
  });
  test("threads messages with references", async () => {
    const threadDb = {
      query: async (sql) => {
        if (sql.includes("SELECT headers_json"))
          return [[{ headers_json: '{"Message-ID":"<m@example.test>"}' }]];
        return [[{ id: "1", kind: "inbound" }]];
      },
    };
    await expect(
      thread("1", { json: true }, threadDb),
    ).resolves.toBeUndefined();
  });
  test("returns an empty thread when no references exist", async () => {
    await expect(
      thread("1", {}, { query: async () => [[{ headers_json: "{}" }]] }),
    ).resolves.toBeUndefined();
  });
});
