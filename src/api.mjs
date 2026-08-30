const defaultTimeoutMs = 30_000;

export function apiModeConfigured() {
  const hasUrl = Boolean(process.env.MAIL_API_URL);
  const hasToken = Boolean(process.env.MAIL_API_TOKEN);
  if (hasUrl !== hasToken)
    throw new Error("MAIL_API_URL and MAIL_API_TOKEN must be configured together");
  return hasUrl;
}

function apiConfig() {
  const baseUrl = process.env.MAIL_API_URL;
  const token = process.env.MAIL_API_TOKEN;
  apiModeConfigured();
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("MAIL_API_URL must be a valid URL");
  }
  if (!/^https?:$/.test(url.protocol))
    throw new Error("MAIL_API_URL must use HTTP or HTTPS");
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error("MAIL_API_URL must be a service root without a path, query, or fragment");
  return { baseUrl: url, token };
}

function timeoutMs() {
  const value = Number(process.env.MAIL_API_TIMEOUT_MS ?? defaultTimeoutMs);
  if (!Number.isInteger(value) || value < 1)
    throw new Error("MAIL_API_TIMEOUT_MS must be a positive integer");
  return value;
}

function redact(value, token) {
  return String(value).replaceAll(token, '[REDACTED]');
}

function throwApiError(response, token, text) {
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  const apiError = payload && typeof payload === "object" && payload.error && typeof payload.error === 'object'
    ? payload.error
    : null;
  const message = apiError?.message
    ? redact(apiError.message, token)
    : typeof payload?.error === 'string'
      ? redact(payload.error, token)
    : `mail API returned HTTP ${response.status}`;
  const error = new Error(message);
  error.code = apiError?.code ?? "MAIL_API_ERROR";
  error.status = response.status;
  error.requestId = payload?.request_id;
  throw error;
}

export async function apiRequest(path, { method = "GET", body, headers = {}, raw = false } = {}, { fetchFn = globalThis.fetch } = {}) {
  const { baseUrl, token } = apiConfig();
  if (typeof fetchFn !== "function") throw new Error("fetch is not available");
  const url = new URL(path, baseUrl);
  const requestHeaders = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...headers,
  };
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData && !requestHeaders["Content-Type"])
    requestHeaders["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetchFn(url, {
      method,
      headers: requestHeaders,
      body: body === undefined || typeof body === "string" || isFormData ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (error) {
    const wrapped = new Error(`mail API request failed: ${redact(error.message, token)}`);
    wrapped.code = "MAIL_API_REQUEST_FAILED";
    throw wrapped;
  }
  if (raw && !response.ok) {
    return throwApiError(response, token, await response.text());
  }
  if (raw) return response;
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) {
    return throwApiError(response, token, text);
  }
  if (payload && typeof payload === 'object' && Object.hasOwn(payload, 'data')) return payload.data;
  throw new Error('mail API returned an invalid JSON response envelope');
}
