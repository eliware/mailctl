import { describe, expect, test } from "@jest/globals";
import { commandHelp, help } from "../src/help.mjs";

describe("help", () => {
  test("lists the available commands and safe defaults", () => {
    const text = help();
    expect(text).toContain("Commands:");
    expect(text).toContain("--json");
    expect(text).toContain("--dry-run");
    expect(text).toContain("Destructive requests require explicit JSON confirmation");
  });

  test("renders every command-specific help entry", () => {
    for (const command of Object.keys(commandHelp)) {
      expect(help([command])).toContain(`mailctl ${command}`);
      expect(help([command])).toContain("USAGE");
    }
  });

  test("falls back to global help for an unknown command", () => {
    expect(help(["unknown"])).toContain("mailctl -");
  });
});
