import { expect, test } from "@jest/globals";
import { redact, throwApiError } from "../src/api-errors.mjs";

test("redacts matching tokens", () => {
  expect(redact("token in message", "token")).toBe("[REDACTED] in message");
});

test("builds errors from JSON API details", () => {
  expect(() =>
    throwApiError(
      { status: 401 },
      "secret",
      '{"error":{"code":"AUTH_FAILED","message":"secret rejected"},"request_id":"req-1"}',
    ),
  ).toThrow(
    expect.objectContaining({
      message: "[REDACTED] rejected",
      code: "AUTH_FAILED",
      status: 401,
      requestId: "req-1",
    }),
  );
});

test("uses string or fallback error messages", () => {
  expect(() => throwApiError({ status: 400 }, "token", '{"error":"token denied"}')).toThrow(
    expect.objectContaining({ message: "[REDACTED] denied", code: "MAIL_API_ERROR" }),
  );
  expect(() => throwApiError({ status: 502 }, "token", "not-json")).toThrow(
    expect.objectContaining({ message: "mail API returned HTTP 502", status: 502 }),
  );
});
