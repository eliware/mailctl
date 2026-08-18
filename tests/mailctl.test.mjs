import { describe, expect, test } from "@jest/globals";
import { readFile } from "node:fs/promises";

describe("mailctl CLI contract", () => {
  test("package exposes a standalone executable", async () => {
    const packageJson = await import("../package.json", { with: { type: "json" } });
    expect(packageJson.default.bin.mailctl).toBe("./mailctl.mjs");
  });

  test("documents sent-mail inspection commands", async () => {
    const source = await readFile(new URL("../mailctl.mjs", import.meta.url), "utf8");
    expect(source).toContain('command === "sent"');
    expect(source).toContain('command === "sent-read"');
    expect(source).toContain("outbound_attempts");
  });
});
