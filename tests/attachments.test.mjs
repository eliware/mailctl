import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { describe, expect, test } from "@jest/globals";

process.env.MAIL_STORAGE_PATH = await mkdtemp(
  join(tmpdir(), "mailctl-storage-"),
);
const gzipAsync = promisify(gzip);
const { attachmentList, saveAttachments, saveSentAttachments } =
  await import("../src/attachments.mjs");

describe("attachment commands", () => {
  test("lists attachment metadata", async () => {
    const db = { query: async () => [[]] };
    await expect(attachmentList("message-1", {}, db)).resolves.toBeUndefined();
  });
  test("handles empty inbound and outbound attachment exports", async () => {
    const db = { query: async () => [[]] };
    const directory = await mkdtemp(join(tmpdir(), "mailctl-empty-"));
    try {
      await expect(
        saveAttachments("message-1", join(directory, "inbound"), {}, db),
      ).resolves.toBeUndefined();
      await expect(
        saveSentAttachments("outbound-1", join(directory, "outbound"), {}, db),
      ).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("extracts compressed and identity attachments and uses a fallback filename", async () => {
    const sourceRoot = process.env.MAIL_STORAGE_PATH;
    const compressedPath = "attachments/aa/compressed";
    const plainPath = "attachments/bb/plain";
    await mkdir(join(sourceRoot, "attachments/aa"), { recursive: true });
    await mkdir(join(sourceRoot, "attachments/bb"), { recursive: true });
    await writeFile(
      join(sourceRoot, compressedPath),
      await gzipAsync("compressed body"),
    );
    await writeFile(join(sourceRoot, plainPath), "plain body");
    const rows = [
      {
        attachment_id: "compressed-id",
        object_path: compressedPath,
        storage_encoding: "gzip",
        original_filename: "compressed.txt",
      },
      {
        attachment_id: "plain-id",
        object_path: plainPath,
        storage_encoding: "identity",
        original_filename: null,
      },
      {
        attachment_id: "escaped-id",
        object_path: plainPath,
        storage_encoding: "identity",
        original_filename: "../exports/escape.txt",
      },
    ];
    const db = { query: async () => [rows] };
    const directory = await mkdtemp(join(tmpdir(), "mailctl-attachments-"));
    try {
      await saveAttachments("message-1", directory, {}, db);
      expect(await readFile(join(directory, "compressed.txt"), "utf8")).toBe(
        "compressed body",
      );
      expect(await readFile(join(directory, "plain-id"), "utf8")).toBe(
        "plain body",
      );
      expect(await readFile(join(directory, "escape.txt"), "utf8")).toBe(
        "plain body",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });
});
