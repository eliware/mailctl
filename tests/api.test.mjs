import { describe, expect, jest, test } from "@jest/globals";
import { apiRequest } from "../src/api.mjs";

describe("API client", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.MAIL_API_URL = "https://mail.example.test";
    process.env.MAIL_API_TOKEN = "test-token";
    delete process.env.MAIL_API_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  test("uses default request options and the global fetch function", async () => {
    const fetchFn = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"data":{"ready":true}}',
    });
    await expect(apiRequest("health", undefined, undefined)).resolves.toEqual({ ready: true });
    expect(fetchFn).toHaveBeenCalledWith(
      new URL("https://mail.example.test/health"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("sends bearer authentication and JSON bodies", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"data":{"ok":true},"request_id":"req-1"}',
    });
    await expect(
      apiRequest(
        "messages",
        {
          method: "POST",
          body: { query: "hello" },
          headers: { "X-Test": "yes" },
        },
        { fetchFn },
      ),
    ).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledWith(
      new URL("https://mail.example.test/messages"),
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
          "X-Test": "yes",
        },
        body: '{"query":"hello"}',
        signal: expect.any(AbortSignal),
      }),
    );
    const form = new FormData();
    form.append("field", "value");
    const formFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"data":{},"request_id":"req-2"}',
    });
    await apiRequest("form", { method: "POST", body: form }, { fetchFn: formFetch });
    expect(formFetch.mock.calls[0][1].body).toBe(form);
    expect(formFetch.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
    const rawResponse = { ok: true, status: 200 };
    const rawFetch = jest.fn().mockResolvedValue(rawResponse);
    await expect(apiRequest("download", { raw: true }, { fetchFn: rawFetch })).resolves.toBe(
      rawResponse,
    );
    const failedRawFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"error":"attachment not found"}',
    });
    await expect(
      apiRequest("download", { raw: true }, { fetchFn: failedRawFetch }),
    ).rejects.toMatchObject({ message: "attachment not found", status: 404 });
    const genericRawFetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 502, text: async () => "not-json" });
    await expect(
      apiRequest("download", { raw: true }, { fetchFn: genericRawFetch }),
    ).rejects.toMatchObject({
      message: "mail API returned HTTP 502",
      code: "MAIL_API_ERROR",
      status: 502,
    });
    const objectRawFetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 400, text: async () => '{"detail":"bad"}' });
    await expect(
      apiRequest("download", { raw: true }, { fetchFn: objectRawFetch }),
    ).rejects.toMatchObject({
      message: "mail API returned HTTP 400",
      code: "MAIL_API_ERROR",
      status: 400,
    });
    const textFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"data":"not-json","request_id":"req-3"}',
    });
    await expect(
      apiRequest(
        "text",
        {
          method: "POST",
          body: "raw body",
          headers: { "Content-Type": "text/plain" },
        },
        { fetchFn: textFetch },
      ),
    ).resolves.toBe("not-json");
  });

  test("normalizes API and transport failures without exposing credentials", async () => {
    const apiError = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        '{"error":{"code":"AUTH_FAILED","message":"unauthorized"},"request_id":"req-auth"}',
    });
    await expect(apiRequest("health", {}, { fetchFn: apiError })).rejects.toMatchObject({
      message: "unauthorized",
      code: "AUTH_FAILED",
      status: 401,
      requestId: "req-auth",
    });
    const transportError = jest.fn().mockRejectedValue(new Error("connection reset"));
    await expect(apiRequest("health", {}, { fetchFn: transportError })).rejects.toMatchObject({
      message: "mail API request failed: connection reset",
      code: "MAIL_API_REQUEST_FAILED",
    });
    const leakingTransport = jest.fn().mockRejectedValue(new Error("body test-token secret"));
    await expect(apiRequest("health", {}, { fetchFn: leakingTransport })).rejects.toMatchObject({
      message: "mail API request failed: body [REDACTED] secret",
    });
    const genericApiError = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "",
    });
    await expect(apiRequest("health", {}, { fetchFn: genericApiError })).rejects.toMatchObject({
      message: "mail API returned HTTP 503",
      code: "MAIL_API_ERROR",
      status: 503,
    });
    await expect(apiRequest("health", {}, { fetchFn: null })).rejects.toThrow(
      "fetch is not available",
    );
    const malformed = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => "not-json" });
    await expect(apiRequest("health", {}, { fetchFn: malformed })).rejects.toThrow(
      "invalid JSON response envelope",
    );
  });
});
