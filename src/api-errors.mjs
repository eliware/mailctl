export function redact(value, token) {
  return String(value).replaceAll(token, "[REDACTED]");
}

export function throwApiError(response, token, text) {
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {}
  const apiError =
    payload && typeof payload === "object" && payload.error && typeof payload.error === "object"
      ? payload.error
      : null;
  const message = apiError?.message
    ? redact(apiError.message, token)
    : typeof payload?.error === "string"
      ? redact(payload.error, token)
      : `mail API returned HTTP ${response.status}`;
  const error = new Error(message);
  error.code = apiError?.code ?? "MAIL_API_ERROR";
  error.status = response.status;
  error.requestId = payload?.request_id;
  throw error;
}
