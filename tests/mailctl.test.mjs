import { describe, expect, test } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { help } from "../src/help.mjs";

describe("mailctl CLI contract", () => {
  test("package exposes a standalone executable", async () => {
    const packageJson = await import("../package.json", { with: { type: "json" } });
    expect(packageJson.default.bin.mailctl).toBe("mailctl.mjs");
  });

  test("documents sent-mail inspection commands", async () => {
    const source = await readFile(new URL("../src/outbound.mjs", import.meta.url), "utf8");
    expect(source).toContain("export async function listSent");
    expect(source).toContain("export async function readSent");
    expect(source).toContain("outbound_attempts");
  });

  test("provides global and command-specific help", () => {
    expect(help()).toContain("mailctl help [COMMAND]");
    expect(help(["send"])).toContain("mailctl send");
  });
});
