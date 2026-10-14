import { apiConfig, timeoutMs } from "./api-config.mjs";
import { redact, throwApiError } from "./api-errors.mjs";

export async function apiRequest(
  path,
  { method = "GET", body, headers = {}, raw = false } = {},
  { fetchFn = globalThis.fetch } = {},
) {
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
      body:
        body === undefined || typeof body === "string" || isFormData ? body : JSON.stringify(body),
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
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    return throwApiError(response, token, text);
  }
  if (payload && typeof payload === "object" && Object.hasOwn(payload, "data")) return payload.data;
  throw new Error("mail API returned an invalid JSON response envelope");
}
