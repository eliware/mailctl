import { mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { userConfigPath, loadUserConfig } from "../src/config.mjs";

describe("configuration", () => {
  test("uses the per-user config directory", () => {
    expect(userConfigPath("home-example")).toBe(
      join("home-example", ".config", "mailctl", ".env"),
    );
  });

  test("uses the process home when no home is supplied", () => {
    expect(userConfigPath()).toBe(join(homedir(), ".config", "mailctl", ".env"));
  });

  test("loads a supplied dotenv file", async () => {
    const home = await mkdtemp(join(tmpdir(), "mailctl-home-"));
    const path = userConfigPath(home);
    await (
      await import("node:fs/promises")
    ).mkdir(join(home, ".config/mailctl"), { recursive: true });
    await writeFile(path, "MAILCTL_TEST_CONFIG=loaded\n");
    const result = loadUserConfig({ home });
    expect(result.parsed.MAILCTL_TEST_CONFIG).toBe("loaded");
  });
});
