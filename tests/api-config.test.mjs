import { afterEach, expect, test } from "@jest/globals";
import { apiConfig, apiModeConfigured, timeoutMs } from "../src/api-config.mjs";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

test("checks paired API settings and accepts an HTTP service root", () => {
  delete process.env.MAIL_API_URL;
  delete process.env.MAIL_API_TOKEN;
  expect(apiModeConfigured()).toBe(false);
  process.env.MAIL_API_URL = "https://mail.example.test";
  expect(apiModeConfigured).toThrow("configured together");
  process.env.MAIL_API_TOKEN = "token";
  expect(apiConfig()).toEqual({ baseUrl: new URL("https://mail.example.test"), token: "token" });
});

test("rejects invalid URLs and non-root service paths", () => {
  process.env.MAIL_API_URL = "not a URL";
  process.env.MAIL_API_TOKEN = "token";
  expect(apiConfig).toThrow("valid URL");
  process.env.MAIL_API_URL = "file:///tmp/mail";
  expect(apiConfig).toThrow("HTTP or HTTPS");
  process.env.MAIL_API_URL = "https://mail.example.test/api";
  expect(apiConfig).toThrow("service root");
  process.env.MAIL_API_URL = "https://mail.example.test/?query=1";
  expect(apiConfig).toThrow("service root");
  process.env.MAIL_API_URL = "https://mail.example.test/#fragment";
  expect(apiConfig).toThrow("service root");
});

test("uses a default timeout and rejects invalid timeout values", () => {
  delete process.env.MAIL_API_TIMEOUT_MS;
  expect(timeoutMs()).toBe(30_000);
  process.env.MAIL_API_TIMEOUT_MS = "0";
  expect(timeoutMs).toThrow("positive integer");
  process.env.MAIL_API_TIMEOUT_MS = "not-a-number";
  expect(timeoutMs).toThrow("positive integer");
  process.env.MAIL_API_TIMEOUT_MS = "1.5";
  expect(timeoutMs).toThrow("positive integer");
});
