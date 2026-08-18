import { describe, expect, test } from "@jest/globals";

const live = process.env.MAILCTL_INTEGRATION === "1";

describe("live mailctl integrations", () => {
  test(live ? "has the required connection configuration" : "is opt-in", () => {
    if (!live) return;
    expect(process.env.MYSQL_URL).toBeTruthy();
    expect(process.env.RABBITMQ_URL).toBeTruthy();
    expect(process.env.MAIL_STORAGE_PATH).toBeTruthy();
  });
});
