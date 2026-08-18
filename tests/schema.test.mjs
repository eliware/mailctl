import { describe, expect, jest, test } from "@jest/globals";
import {
  assertSchemaVersion,
  REQUIRED_SCHEMA_VERSION,
} from "../src/schema.mjs";

describe("schema compatibility", () => {
  test("accepts the current schema", async () => {
    const db = {
      async query() {
        return [[{ package_version: REQUIRED_SCHEMA_VERSION }]];
      },
    };
    await expect(assertSchemaVersion(db)).resolves.toBe(
      REQUIRED_SCHEMA_VERSION,
    );
  });

  test("allows an older schema", async () => {
    const db = {
      async query() {
        return [[{ package_version: "0.1.0" }]];
      },
    };
    await expect(assertSchemaVersion(db)).resolves.toBe("0.1.0");
  });

  test("warns when the schema is newer", async () => {
    const warn = jest.fn();
    const db = {
      async query() {
        return [[{ package_version: "1.2.0" }]];
      },
    };
    await expect(
      assertSchemaVersion(db, { packageVersion: "1.1.0", log: { warn } }),
    ).resolves.toBe("1.2.0");
    expect(warn).toHaveBeenCalledWith(
      "Mail schema is newer than mailctl; upgrade suggested",
      expect.objectContaining({
        mailctlVersion: "1.1.0",
        schemaVersion: "1.2.0",
      }),
    );
  });

  test("handles malformed versions and missing schema", async () => {
    const malformed = {
      async query() {
        return [[{ package_version: "development" }]];
      },
    };
    await expect(
      assertSchemaVersion(malformed, {
        packageVersion: "development",
        log: {},
      }),
    ).resolves.toBe("development");
    const missing = {
      async query() {
        return [[]];
      },
    };
    await expect(assertSchemaVersion(missing)).rejects.toThrow(
      "schema version is missing",
    );
  });

  test("handles a null package version without failing startup", async () => {
    const db = {
      async query() {
        return [[{ package_version: "1.2.0" }]];
      },
    };
    await expect(
      assertSchemaVersion(db, { packageVersion: null, log: {} }),
    ).resolves.toBe("1.2.0");
  });
});
