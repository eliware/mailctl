const defaultTimeoutMs = 30_000;

export function apiModeConfigured() {
  const hasUrl = Boolean(process.env.MAIL_API_URL);
  const hasToken = Boolean(process.env.MAIL_API_TOKEN);
  if (hasUrl !== hasToken)
    throw new Error("MAIL_API_URL and MAIL_API_TOKEN must be configured together");
  return hasUrl;
}

export function apiConfig() {
  const baseUrl = process.env.MAIL_API_URL;
  const token = process.env.MAIL_API_TOKEN;
  apiModeConfigured();
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("MAIL_API_URL must be a valid URL");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("MAIL_API_URL must use HTTP or HTTPS");
  if (url.pathname !== "/" || url.search || url.hash)
    throw new Error("MAIL_API_URL must be a service root without a path, query, or fragment");
  return { baseUrl: url, token };
}

export function timeoutMs() {
  const value = Number(process.env.MAIL_API_TIMEOUT_MS ?? defaultTimeoutMs);
  if (!Number.isInteger(value) || value < 1)
    throw new Error("MAIL_API_TIMEOUT_MS must be a positive integer");
  return value;
}
