import { describe, expect, test } from "@jest/globals";

describe("mailctl CLI contract", () => {
  test("package exposes a standalone executable", async () => {
    const packageJson = await import("../package.json", { with: { type: "json" } });
    expect(packageJson.default.bin.mailctl).toBe("./mailctl.mjs");
  });
});
