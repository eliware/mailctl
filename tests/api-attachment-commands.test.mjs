import { afterEach, expect, jest, test } from "@jest/globals";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apiRequest = jest.fn();
const output = jest.fn();
jest.unstable_mockModule("../src/api.mjs", () => ({ apiRequest }));
jest.unstable_mockModule("../src/output.mjs", () => ({ output }));
const { runAttachmentCommand } = await import("../src/api-attachment-commands.mjs");

afterEach(() => jest.restoreAllMocks());

test("lists attachments and returns an empty list when metadata is absent", async () => {
  apiRequest.mockResolvedValueOnce({ attachments: [{ attachment_id: "a-1" }] });
  await runAttachmentCommand("attachments", ["m-1"], {});
  expect(output).toHaveBeenLastCalledWith([{ attachment_id: "a-1" }], {});
  apiRequest.mockResolvedValueOnce({});
  await runAttachmentCommand("attachments", ["m-2"], {});
  expect(output).toHaveBeenLastCalledWith([], {});
});

test("saves attachments without overwrite and supports empty data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mailctl-attachments-"));
  try {
    await writeFile(join(directory, "note.txt"), "existing");
    apiRequest
      .mockResolvedValueOnce({
        attachments: [
          { attachment_id: "a-1", original_filename: "../note.txt" },
          { attachment_id: "a-2", original_filename: "CON.txt" },
          { attachment_id: "a-3", original_filename: "..." },
        ],
      })
      .mockResolvedValueOnce({ body: new Response("new bytes").body })
      .mockResolvedValueOnce({ body: null })
      .mockResolvedValueOnce({ body: null });
    await runAttachmentCommand("save-attachments", ["m-1", directory], {});
    expect(await readFile(join(directory, "note.txt"), "utf8")).toBe("existing");
    expect(await readFile(join(directory, "note-2.txt"), "utf8")).toBe("new bytes");
    expect((await readdir(directory)).sort()).toEqual([
      "_CON.txt",
      "a-3",
      "note-2.txt",
      "note.txt",
    ]);
    expect(output).toHaveBeenCalled();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("saves sent attachments and removes partial files on stream errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mailctl-sent-attachments-"));
  try {
    apiRequest
      .mockResolvedValueOnce({
        attachments: [{ attachment_id: "a-1", original_filename: "bad?.txt" }],
      })
      .mockResolvedValueOnce({ body: new Response("sent").body });
    await runAttachmentCommand("save-sent-attachments", ["o-1", directory], {});
    expect(await readFile(join(directory, "bad_.txt"), "utf8")).toBe("sent");
    apiRequest
      .mockResolvedValueOnce({
        attachments: [{ attachment_id: "a-2", original_filename: "part.txt" }],
      })
      .mockResolvedValueOnce({
        body: new ReadableStream({
          pull(controller) {
            if (this.sent) controller.error(new Error("stream failed"));
            else {
              this.sent = true;
              controller.enqueue(new TextEncoder().encode("part"));
            }
          },
        }),
      });
    await expect(
      runAttachmentCommand("save-sent-attachments", ["o-2", directory], {}),
    ).rejects.toThrow("stream failed");
    expect(await readdir(directory)).toEqual(["bad_.txt"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("returns no result for unrelated commands", async () => {
  await expect(runAttachmentCommand("send", [], {})).resolves.toBeUndefined();
});

test("uses the configured directory and handles missing names and long paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mailctl-attachment-errors-"));
  try {
    apiRequest
      .mockResolvedValueOnce({
        attachments: [{ attachment_id: "fallback", original_filename: null }],
      })
      .mockResolvedValueOnce({ body: null });
    await runAttachmentCommand("save-attachments", ["m-1"], { directory });
    expect(await readFile(join(directory, "fallback"), "utf8")).toBe("");
    apiRequest
      .mockResolvedValueOnce({
        attachments: [{ attachment_id: "long", original_filename: "x".repeat(300) }],
      })
      .mockResolvedValueOnce({ body: new Response("data").body });
    await expect(
      runAttachmentCommand("save-attachments", ["m-2", directory], {}),
    ).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("saves no files when attachment metadata is absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mailctl-no-attachments-"));
  try {
    apiRequest.mockResolvedValueOnce({});
    await runAttachmentCommand("save-sent-attachments", ["o-1", directory], {});
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
